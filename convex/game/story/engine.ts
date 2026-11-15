import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { selectEligibleBeat } from "../../ravo/director/story";
import { currentGroup } from "../engine";
import { effect, graph } from "./model";

type Graph = Infer<typeof graph>;
type Effect = Infer<typeof effect>;

function validateGraph(input: Graph, insightKeys: Set<string>, clueKeys: Set<string>, initialFlags: Record<string, boolean>) {
  const validKey = (key: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(key) && !["__proto__", "prototype", "constructor"].includes(key);
  const validLabel = (label: string) => label.trim().length > 0 && label.length <= 160;
  const routes = new Set(input.routes.map((route) => route.key));
  if (!validKey(input.caseKey) || input.beats.length > 100 || input.decisions.length > 100 || input.routes.length > 100 ||
    routes.size !== input.routes.length || input.routes.some((route) => !validKey(route.key) || !validLabel(route.publicLabel))) throw new Error("Invalid graph");
  const possibleFlags = [...input.beats.flatMap((beat) => beat.effects), ...input.decisions.flatMap((decision) => decision.options.flatMap((option) => option.effects))]
    .filter((item): item is Extract<Effect, { kind: "flag" }> => item.kind === "flag");
  const beats = new Set<string>();
  for (const beat of input.beats) {
    if (!validKey(beat.key) || beats.has(beat.key) || !Number.isSafeInteger(beat.act) || beat.act < 0 ||
      beat.requiredBeats.length > 100 || beat.requiredInsights.length > 100 || beat.requiredClues.length > 100 || Object.keys(beat.requiredFlags).length > 100 ||
      [beat.minDay, beat.forceAtDay].some((day) => day !== undefined && (!Number.isSafeInteger(day) || day < 1)) ||
      beat.requiredBeats.some((key) => !beats.has(key)) || beat.requiredInsights.some((key) => !insightKeys.has(key)) ||
      beat.requiredClues.some((key) => !clueKeys.has(key)) || Object.entries(beat.requiredFlags).some(([key, value]) =>
        !validKey(key) || (initialFlags[key] !== value && !possibleFlags.some((item) => item.key === key && item.value === value)))) throw new Error("Invalid beat or prerequisite");
    validateEffects(beat.effects);
    beats.add(beat.key);
  }
  const decisions = new Set<string>();
  for (const decision of input.decisions) {
    const options = new Set(decision.options.map((option) => option.key));
    if (!validKey(decision.key) || !validLabel(decision.publicLabel) || decisions.has(decision.key) || !beats.has(decision.requiredBeat) ||
      !Number.isSafeInteger(decision.durationMs) || decision.durationMs < 1 || decision.durationMs > 30 * 86400000 ||
      decision.options.length < 2 || decision.options.length > 20 || options.size !== decision.options.length ||
      !options.has(decision.tieOption) || !options.has(decision.defaultOption) || [...options].some((key) => !validKey(key)) ||
      decision.options.some((option) => !validLabel(option.publicLabel))) throw new Error("Invalid decision");
    for (const option of decision.options) validateEffects(option.effects);
    decisions.add(decision.key);
  }
  const reachable = new Set<string>();
  const values = new Set(Object.entries(initialFlags).map(([key, value]) => `${key}:${value}`));
  const markEffects = (effects: Effect[]) => {
    for (const item of effects) if (item.kind === "flag") values.add(`${item.key}:${item.value}`);
  };
  let changed = true;
  while (changed) {
    const before = reachable.size + values.size;
    for (const beat of input.beats) {
      if (beat.requiredBeats.every((key) => reachable.has(key)) && Object.entries(beat.requiredFlags).every(([key, value]) => values.has(`${key}:${value}`))) {
        reachable.add(beat.key);
        markEffects(beat.effects);
      }
    }
    for (const decision of input.decisions) if (reachable.has(decision.requiredBeat)) for (const option of decision.options) markEffects(option.effects);
    changed = before !== reachable.size + values.size;
  }
  if (reachable.size !== input.beats.length) throw new Error("Unreachable beat prerequisites");
  function validateEffects(effects: Effect[]) {
    if (effects.length > 20 || effects.some((item) => !validKey(item.key) || (item.kind === "route" && !routes.has(item.key)))) throw new Error("Invalid effects");
  }
}

async function context(ctx: MutationCtx, groupId: Id<"groups">) {
  const group = await ctx.db.get(groupId);
  if (!group || group.status !== "active") throw new Error("Group is not active");
  const instance = await ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique();
  const state = await ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique();
  if (!instance || !state || instance.caseId !== group.caseId) throw new Error("Story is not initialized");
  return { group, instance, state };
}

async function replay(ctx: MutationCtx, groupId: Id<"groups">, eventKey: string, operation: string, payload: string) {
  if (!eventKey || eventKey.length > 200) throw new Error("Invalid event key");
  const existing = await ctx.db.query("storyOperations").withIndex("by_group_event", (q) => q.eq("groupId", groupId).eq("eventKey", eventKey)).unique();
  if (existing && (existing.operation !== operation || existing.payload !== payload)) throw new Error("Conflicting event");
  return existing;
}

async function record(ctx: MutationCtx, groupId: Id<"groups">, eventKey: string, operation: string, payload: string, version: number) {
  await ctx.db.insert("storyOperations", { groupId, eventKey, operation, payload, version });
}

function applied(effects: Effect[], state: Doc<"storyStates">, instance: Doc<"storyInstances">) {
  const flags = { ...state.flags };
  let route = instance.route;
  for (const item of effects) {
    if (item.kind === "flag") flags[item.key] = item.value;
    else route = item.key;
  }
  return { flags, route };
}

async function nextEligible(ctx: MutationCtx, group: Doc<"groups">, instance: Doc<"storyInstances">, state: Doc<"storyStates">) {
  const [progress, unlocks] = await Promise.all([
    ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
  ]);
  const snapshot = { day: group.day, act: state.act, version: state.version, doneBeats: state.doneBeats, flags: state.flags,
    creditedInsights: progress.map((p) => p.insightKey), unlockedClues: unlocks.map((u) => u.clueKey) };
  const candidates = instance.graph.beats.filter((beat) => beat.requiredBeats.every((key) => state.doneBeats.includes(key)));
  const eligible = selectEligibleBeat(snapshot, candidates.map((candidate) => ({ ...candidate, effects: [] })));
  return candidates.find((candidate) => candidate.key === eligible?.key);
}

export const planNext = internalMutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const { group, instance, state } = await context(ctx, groupId);
    const current = await currentGroup(ctx, group);
    const beat = await nextEligible(ctx, current, instance, state);
    return { version: state.version, beatKey: beat?.key ?? null };
  },
});

export const initialize = internalMutation({
  args: { groupId: v.id("groups"), graph },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId);
    if (!group || group.status !== "active") throw new Error("Group is not active");
    const caseDoc = await ctx.db.get(group.caseId);
    if (!caseDoc || caseDoc.key !== args.graph.caseKey) throw new Error("Case mismatch");
    const [insights, clues, existing, state] = await Promise.all([
      ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect(),
      ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect(),
      ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).unique(),
      ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).unique(),
    ]);
    if (existing) {
      if (existing.caseId !== group.caseId || JSON.stringify(existing.graph) !== JSON.stringify(args.graph)) throw new Error("Story graph is immutable");
      return existing._id;
    }
    validateGraph(args.graph, new Set(insights.map((x) => x.key)), new Set(clues.map((x) => x.key)), state?.flags ?? {});
    if (!state) await ctx.db.insert("storyStates", { groupId: args.groupId, version: 0, act: 0, doneBeats: [], flags: {}, lastProgressDay: group.day });
    return await ctx.db.insert("storyInstances", { groupId: args.groupId, caseId: group.caseId, graph: args.graph });
  },
});

export const transition = internalMutation({
  args: { groupId: v.id("groups"), beatKey: v.string(), eventKey: v.string(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const payload = JSON.stringify({ beatKey: args.beatKey });
    const previous = await replay(ctx, args.groupId, args.eventKey, "transition", payload);
    if (previous) return previous.version;
    const { group: staleGroup, instance, state } = await context(ctx, args.groupId);
    if (state.version !== args.expectedVersion) throw new Error("Stale version");
    const group = await currentGroup(ctx, staleGroup);
    const beat = await nextEligible(ctx, group, instance, state);
    if (!beat || beat.key !== args.beatKey) throw new Error("Beat is not eligible");
    const { flags, route } = applied(beat.effects, state, instance);
    const version = state.version + 1;
    await ctx.db.patch(state._id, { version, flags, act: Math.max(state.act, beat.act), doneBeats: [...state.doneBeats, beat.key] });
    await ctx.db.patch(instance._id, { route });
    await record(ctx, args.groupId, args.eventKey, "transition", payload, version);
    return version;
  },
});

export const openDecision = internalMutation({
  args: { groupId: v.id("groups"), decisionKey: v.string(), eventKey: v.string(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const payload = JSON.stringify({ decisionKey: args.decisionKey });
    const previous = await replay(ctx, args.groupId, args.eventKey, "open", payload);
    if (previous) return previous.version;
    const { group, instance, state } = await context(ctx, args.groupId);
    if (state.version !== args.expectedVersion) throw new Error("Stale version");
    const definition = instance.graph.decisions.find((item) => item.key === args.decisionKey);
    if (!definition || !state.doneBeats.includes(definition.requiredBeat)) throw new Error("Decision is not eligible");
    const existing = await ctx.db.query("storyDecisions").withIndex("by_group_key", (q) => q.eq("groupId", args.groupId).eq("key", args.decisionKey)).unique();
    if (existing) throw new Error("Decision already opened");
    const players = await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).take(101);
    if (!players.length || players.length > 100) throw new Error("Invalid electorate");
    const deadline = Date.now() + (group.gameTimeOffsetMs ?? 0) + definition.durationMs;
    await ctx.db.insert("storyDecisions", { groupId: args.groupId, key: definition.key, electorate: players.map((p) => p._id), deadline, votes: [] });
    const version = state.version + 1;
    await ctx.db.patch(state._id, { version });
    await record(ctx, args.groupId, args.eventKey, "open", payload, version);
    return version;
  },
});

function winner(definition: Graph["decisions"][number], votes: Doc<"storyDecisions">["votes"]) {
  if (!votes.length) return definition.defaultOption;
  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote.optionKey, (counts.get(vote.optionKey) ?? 0) + 1);
  const high = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, count]) => count === high).map(([key]) => key);
  return leaders.length === 1 ? leaders[0] : definition.tieOption;
}

export const vote = internalMutation({
  args: { groupId: v.id("groups"), decisionId: v.id("storyDecisions"), playerId: v.id("players"), optionKey: v.string(), eventKey: v.string(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const payload = JSON.stringify({ decisionId: args.decisionId, playerId: args.playerId, optionKey: args.optionKey });
    const previous = await replay(ctx, args.groupId, args.eventKey, "vote", payload);
    if (previous) return previous.version;
    const { group, instance, state } = await context(ctx, args.groupId);
    if (state.version !== args.expectedVersion) throw new Error("Stale version");
    const decision = await ctx.db.get(args.decisionId);
    const player = await ctx.db.get(args.playerId);
    if (!decision || decision.groupId !== args.groupId || !player || player.groupId !== args.groupId || !decision.electorate.includes(args.playerId)) throw new Error("Invalid membership");
    const definition = instance.graph.decisions.find((item) => item.key === decision.key);
    if (!definition || !definition.options.some((option) => option.key === args.optionKey)) throw new Error("Invalid option");
    if (decision.resolvedOption || Date.now() + (group.gameTimeOffsetMs ?? 0) >= decision.deadline) throw new Error("Decision closed");
    if (decision.votes.some((vote) => vote.playerId === args.playerId)) throw new Error("Player already voted");
    const votes = [...decision.votes, { playerId: args.playerId, optionKey: args.optionKey }];
    const resolvedOption = votes.length === decision.electorate.length ? winner(definition, votes) : undefined;
    const effects = definition.options.find((option) => option.key === resolvedOption)?.effects ?? [];
    const { flags, route } = applied(effects, state, instance);
    const version = state.version + 1;
    await ctx.db.patch(decision._id, { votes, resolvedOption });
    await ctx.db.patch(state._id, { version, flags });
    await ctx.db.patch(instance._id, { route });
    await record(ctx, args.groupId, args.eventKey, "vote", payload, version);
    return version;
  },
});

export const resolveDeadline = internalMutation({
  args: { groupId: v.id("groups"), decisionId: v.id("storyDecisions"), eventKey: v.string(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const payload = JSON.stringify({ decisionId: args.decisionId });
    const previous = await replay(ctx, args.groupId, args.eventKey, "resolve", payload);
    if (previous) return previous.version;
    const { group, instance, state } = await context(ctx, args.groupId);
    if (state.version !== args.expectedVersion) throw new Error("Stale version");
    const decision = await ctx.db.get(args.decisionId);
    if (!decision || decision.groupId !== args.groupId || decision.resolvedOption) throw new Error("Decision closed");
    if (Date.now() + (group.gameTimeOffsetMs ?? 0) < decision.deadline) throw new Error("Deadline not reached");
    const definition = instance.graph.decisions.find((item) => item.key === decision.key);
    if (!definition) throw new Error("Invalid decision");
    const resolvedOption = winner(definition, decision.votes);
    const { flags, route } = applied(definition.options.find((option) => option.key === resolvedOption)!.effects, state, instance);
    const version = state.version + 1;
    await ctx.db.patch(decision._id, { resolvedOption });
    await ctx.db.patch(state._id, { version, flags });
    await ctx.db.patch(instance._id, { route });
    await record(ctx, args.groupId, args.eventKey, "resolve", payload, version);
    return version;
  },
});

export const snapshot = internalQuery({
  args: { groupId: v.id("groups"), playerId: v.id("players") },
  handler: async (ctx, { groupId, playerId }) => {
    const [group, player, instance, state, decisions] = await Promise.all([
      ctx.db.get(groupId), ctx.db.get(playerId),
      ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
      ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
      ctx.db.query("storyDecisions").withIndex("by_group", (q) => q.eq("groupId", groupId)).take(101),
    ]);
    if (!group || group.status !== "active" || !player || player.groupId !== groupId || !instance || instance.caseId !== group.caseId || !state) throw new Error("Invalid story audience");
    const route = instance.graph.routes.find((item) => item.key === instance.route)?.publicLabel;
    return { version: state.version, act: state.act, route,
      decisions: decisions.map((decision) => {
        const definition = instance.graph.decisions.find((item) => item.key === decision.key);
        if (!definition) throw new Error("Invalid decision");
        const resolvedIndex = decision.resolvedOption === undefined ? undefined : definition.options.findIndex((item) => item.key === decision.resolvedOption);
        if (resolvedIndex === -1) throw new Error("Invalid decision outcome");
        return { id: decision._id, label: definition.publicLabel, deadline: decision.deadline, resolvedIndex,
          options: definition.options.map((item, index) => ({ index, label: item.publicLabel })),
          eligible: decision.electorate.includes(playerId), voted: decision.votes.some((vote) => vote.playerId === playerId) };
      }) };
  },
});

export const optionKeyForIndex = internalQuery({
  args: { groupId: v.id("groups"), decisionId: v.id("storyDecisions"), playerId: v.id("players"), optionIndex: v.number() },
  handler: async (ctx, { groupId, decisionId, playerId, optionIndex }) => {
    const [group, player, decision, instance] = await Promise.all([
      ctx.db.get(groupId), ctx.db.get(playerId), ctx.db.get(decisionId),
      ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
    ]);
    if (!group || group.status !== "active" || !player || player.groupId !== groupId || !decision || decision.groupId !== groupId ||
      !decision.electorate.includes(playerId) || !instance || instance.caseId !== group.caseId || !Number.isSafeInteger(optionIndex)) throw new Error("Invalid decision audience");
    const option = instance.graph.decisions.find((item) => item.key === decision.key)?.options[optionIndex];
    if (!option) throw new Error("Invalid option");
    return option.key;
  },
});
