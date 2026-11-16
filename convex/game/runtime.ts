import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { Doc, Id } from "../_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "../_generated/server";
import { assignImpl, COMMON_CHARACTER } from "../ravo/casts";
import { vRavoDirective } from "../ravo/types";
import { planCast } from "../ravo/director/casting";
import { buildScriptedDirective } from "../ravo/director/context";
import { reviewedContentForCase } from "../ravo/director/content";
import { planStoryTransition, selectEligibleBeat } from "../ravo/director/story";
import { matchInsights } from "../ravo/scoring";
import { currentGroup, projectedDay, unlockClueImpl } from "./engine";
import { authorizeIntegratedReplay, processIntegratedTurn } from "./integration/runtime";
import { consumeDailyTurn, dailyStatus } from "./integration/daily";
import { initializeSfGroup } from "./integration/sf";
import { SF_CONTENT_REVISION } from "../cases/sfCandidate";

const replayCommand = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: "1" | "2" | "3"; caseId: Id<"cases">; day: number; command: Doc<"commandReceipts">["command"] }, unknown>("game/commands/dispatch:dispatch");

async function closureBinding(ctx: QueryCtx, message: Doc<"messages">, playerId: Id<"players">, lineId: string, expectedAgentKey?: string) {
  const cast = lineId === "1" ? null : await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", playerId).eq("lineId", lineId)).unique();
  const agentKey = lineId === "1" ? COMMON_CHARACTER.agentKey : cast?.groupId === message.groupId ? cast.agentKey : undefined;
  if (!agentKey || (expectedAgentKey !== undefined && expectedAgentKey !== agentKey) || (message.agentKey !== undefined && message.agentKey !== agentKey)) return null;
  return JSON.stringify({ body: message.body, agentKey: message.agentKey ?? null, castAgentKey: agentKey, intakeCaseId: message.intakeCaseId ?? null, intakeDay: message.intakeDay ?? null });
}

export async function authorizedReplay(ctx: QueryCtx, event: Doc<"storyEvents">) {
  const group = await ctx.db.get(event.groupId);
  const player = await ctx.db.get(event.playerId);
  const message = await ctx.db.get(event.messageId);
  if (!group || group.status !== "active" || group.caseId !== event.caseId || !player || player.groupId !== event.groupId || !message ||
    message.groupId !== event.groupId || message.playerId !== event.playerId || message.kind !== "chat" || message.source !== "keiki" ||
    message.lineId !== event.lineId || message.answerId !== event.answerId) return null;
  const directive = JSON.parse(event.directiveJson);
  const daily = await dailyStatus(ctx, group, event.playerId);
  if (daily.limit !== undefined && projectedDay(group) !== group.day) return null;
  if (event.dailyClosureDay !== undefined) return daily.closed && event.dailyClosureDay === group.day && directive.character.agentKey === "common" && event.sheetJson === await closureBinding(ctx, message, event.playerId, event.lineId) ? directive : null;
  if (daily.closed && (daily.completed || event.dailyTurnDay !== group.day || event.dailyTurn === undefined || daily.limit === undefined || event.dailyTurn > daily.limit || event.dailyTurnLimit !== daily.limit)) return null;
  if (message.agentKey !== undefined && message.agentKey !== directive.character.agentKey) return null;
  if (event.integrationJson !== undefined) return await authorizeIntegratedReplay(ctx, event) ? directive : null;
  if (event.lineId !== "1") {
    const cast = await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", event.playerId).eq("lineId", event.lineId)).unique();
    if (!cast || cast.groupId !== event.groupId || cast.agentKey !== directive.character.agentKey) return null;
  } else if (directive.character.agentKey !== COMMON_CHARACTER.agentKey) return null;
  const caseRecord = await ctx.db.get(group.caseId);
  if (!caseRecord) return null;
  const content = reviewedContentForCase(caseRecord.key);
  const sheet = Object.hasOwn(content.characters, directive.character.agentKey) ? content.characters[directive.character.agentKey] : undefined;
  if (JSON.stringify(sheet ?? null) !== event.sheetJson) return null;
  const unlocks = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", event.groupId)).collect();
  if (event.clueKeys.some((key) => !unlocks.some((unlock) => unlock.clueKey === key) || !sheet?.clueKeys.includes(key))) return null;
  const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
  const progress = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", event.groupId)).collect();
  if (event.insightKeys.some((key) => !progress.some((item) => item.insightKey === key) || !Object.hasOwn(content.insightLabels, key))) return null;
  let questionPrompt: string | null = null;
  if (event.questionKey !== undefined) {
    if (projectedDay(group) !== event.questionDay) return null;
    const answers = await ctx.db.query("answers").withIndex("by_player_day", (q) => q.eq("playerId", event.playerId).eq("day", event.questionDay!)).collect();
    if (answers.some((answer) => answer.questionKey === event.questionKey)) return null;
    const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", event.questionDay!)).collect();
    questionPrompt = questions.find((question) => question.key === event.questionKey)?.prompt ?? null;
    if (questionPrompt === null) return null;
  }
  const currentContent = JSON.stringify({ clues: event.clueKeys.map((key) => {
    const clue = clues.find((item) => item.key === key);
    return clue ? { key, id: clue._id, name: clue.name, summary: clue.summary } : null;
  }), labels: event.insightKeys.map((key) => content.insightLabels[key]), questionPrompt });
  if (currentContent !== event.contentJson) return null;
  return directive;
}

async function applyAnswer(ctx: MutationCtx, group: Doc<"groups">, playerId: Id<"players">, answerId: Id<"answers">) {
  const answer = await ctx.db.get(answerId);
  if (!answer || answer.groupId !== group._id || answer.playerId !== playerId || answer.day > group.day) throw new Error("Invalid answer");
  const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", answer.day)).collect();
  const question = questions.find((q) => q.key === answer.questionKey);
  if (!question) throw new Error("Invalid answer");
  const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
  const progress = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  const found = new Set(progress.map((p) => p.insightKey));
  const hits = matchInsights(insights, answer.text).filter((key) => question.insightKeys.includes(key));
  let credited = false;
  for (const key of hits) {
    if (found.has(key)) continue;
    await ctx.db.insert("progress", { groupId: group._id, playerId, insightKey: key, day: group.day });
    found.add(key);
    credited = true;
  }
  if (credited) {
    const total = insights.reduce((sum, insight) => sum + insight.weight, 0);
    const earned = insights.filter((insight) => found.has(insight.key)).reduce((sum, insight) => sum + insight.weight, 0);
    await ctx.db.patch(group._id, { progress: total > 0 ? Math.round(earned / total * 100) : 0 });
  }
  const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
  const opened: Doc<"clues">[] = [];
  for (const clue of clues) if ("insight" in clue.unlock && found.has(clue.unlock.insight) && await unlockClueImpl(ctx, group, clue.key)) opened.push(clue);
  return { credited, opened, hits };
}

export const processAnswer = internalMutation({
  args: { answerId: v.id("answers") },
  returns: v.null(),
  handler: async (ctx, { answerId }) => {
    const answer = await ctx.db.get(answerId);
    if (!answer) throw new Error("Invalid answer");
    const player = await ctx.db.get(answer.playerId);
    let group = await ctx.db.get(answer.groupId);
    if (!player || player.groupId !== answer.groupId || !group || group.status !== "active") throw new Error("Invalid answer");
    group = await currentGroup(ctx, group);
    const { hits } = await applyAnswer(ctx, group, player._id, answerId);
    const verdict = hits.length > 0 ? `That's it, Detective ${player.name}. Keep pulling that thread.` : `Not quite, Detective ${player.name}. The answer is in the evidence.`;
    await ctx.db.patch(answerId, { score: hits.length > 0 ? 1 : 0, verdict });
    return null;
  },
});

export const processConsult = internalMutation({
  args: {
    groupId: v.id("groups"),
    playerId: v.optional(v.id("players")),
    messageId: v.id("messages"),
    lineId: v.string(),
    agentKey: v.optional(v.string()),
    answerId: v.optional(v.id("answers")),
  },
  returns: vRavoDirective,
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    const playerId = args.playerId ?? message?.playerId;
    if (!message || message.kind !== "chat" || message.source !== "keiki" || message.groupId !== args.groupId || !playerId || message.playerId !== playerId ||
      (args.lineId !== "1" && args.lineId !== "2" && args.lineId !== "3") || message.lineId !== args.lineId ||
      message.answerId !== args.answerId || (message.agentKey !== undefined && args.agentKey !== undefined && message.agentKey !== args.agentKey)) throw new Error("Invalid conversation");
    const player = await ctx.db.get(playerId);
    let group = await ctx.db.get(args.groupId);
    if (!player || player.groupId !== args.groupId || !group || group.status !== "active") throw new Error("Invalid conversation");
    const prior = await ctx.db.query("storyEvents").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).unique();
    if (prior) {
      if (prior.groupId !== args.groupId || prior.playerId !== playerId || prior.lineId !== args.lineId || prior.answerId !== args.answerId) throw new Error("Invalid conversation");
      const directive = await authorizedReplay(ctx, prior);
      if (!directive || (prior.dailyClosureDay === undefined && args.agentKey !== undefined && args.agentKey !== directive.character.agentKey)) throw new Error("Conversation authorization changed");
      return directive;
    }
    if (args.answerId && await ctx.db.query("storyEvents").withIndex("by_answer", (q) => q.eq("answerId", args.answerId)).first()) throw new Error("Answer already processed");
    group = await currentGroup(ctx, group);
    const daily = await dailyStatus(ctx, group, playerId);
    const receipt = await ctx.db.query("commandReceipts").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).unique();
    const countedCommand = receipt && receipt.groupId === group._id && receipt.playerId === playerId && receipt.caseId === group.caseId && receipt.day === group.day && receipt.lineId === args.lineId && receipt.dailyTurn !== undefined && receipt.dailyTurnLimit !== undefined &&
      (receipt.result.kind === "answer" || receipt.result.kind === "ability" || receipt.result.kind === "accusation" || (receipt.result.kind === "hint" && receipt.result.value));
    const answer = args.answerId && await ctx.db.get(args.answerId);
    const countedAnswer = answer && answer.groupId === group._id && answer.playerId === playerId && answer.day === group.day && answer.dailyTurnCharged && answer.dailyTurn !== undefined && answer.dailyTurnLimit !== undefined;
    const previousAdmission = daily.limit === undefined ? undefined : countedCommand ? { turn: receipt.dailyTurn!, limit: receipt.dailyTurnLimit! } : countedAnswer ? { turn: answer.dailyTurn!, limit: answer.dailyTurnLimit! } : undefined;
    const finalAdmittedTurn = previousAdmission && !daily.completed && previousAdmission.turn === daily.limit && previousAdmission.turn === daily.counter?.turns && previousAdmission.limit === daily.limit;
    if (daily.closed && !finalAdmittedTurn) {
      const binding = await closureBinding(ctx, message, playerId, args.lineId, args.agentKey);
      if (!binding) throw new Error("Invalid conversation");
      const next = group.dayOpenedAt === undefined ? "the next game day" : new Date(group.dayOpenedAt + 86400000 - (group.gameTimeOffsetMs ?? 0)).toISOString();
      const directive = { character: COMMON_CHARACTER, guidance: `Your session is complete. Return tomorrow. Next unlock: ${next}.`, tone: "noir", endTurn: true };
      await ctx.db.insert("storyEvents", { groupId: group._id, caseId: group.caseId, playerId, messageId: args.messageId, lineId: args.lineId, answerId: args.answerId,
        sheetJson: binding, contentJson: "{}", clueKeys: [], insightKeys: [], directiveJson: JSON.stringify(directive), dailyClosureDay: group.day });
      return directive;
    }
    if (countedCommand) await ctx.runMutation(replayCommand, { groupId: group._id, playerId, messageId: args.messageId, lineId: receipt.lineId, caseId: group.caseId, day: group.day, command: receipt.command });
    const admitted = previousAdmission ?? await consumeDailyTurn(ctx, group, playerId);
    const caseRecord = await ctx.db.get(group.caseId);
    if (!caseRecord) throw new Error("Invalid case");
    const fixture = caseRecord.contentRevision === SF_CONTENT_REVISION
      ? await initializeSfGroup(ctx, group._id, group.caseId)
      : await ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", group!._id)).unique();
    if (fixture) {
      const before = group.progress;
      if (args.answerId) await applyAnswer(ctx, group, playerId, args.answerId);
      const latestGroup = (await ctx.db.get(group._id))!;
      return await processIntegratedTurn(ctx, { group: latestGroup, player, messageId: args.messageId,
        lineId: args.lineId as "1" | "2" | "3", agentKey: args.agentKey ?? message.agentKey,
        answerId: args.answerId, progressDelta: latestGroup.progress - before, fixture, admitted });
    }
    const storyInstance = await ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", group!._id)).unique();
    const content = reviewedContentForCase(caseRecord.key);
    const assigned = await assignImpl(ctx, playerId, args.lineId, args.agentKey ?? message.agentKey);
    const lineId = args.lineId;
    const role = player.roleKey ?? "forensic";
    const character = planCast({ lineId, role, roleOrdinal: 0, commonCharacter: COMMON_CHARACTER,
      characters: [assigned], castPlan: { [role]: { "2": [assigned.agentKey], "3": [assigned.agentKey] } } });
    if (!character || character.agentKey !== assigned.agentKey) throw new Error("Invalid conversation");

    const before = group.progress;
    let credited = false;
    let opened: Doc<"clues">[] = [];
    let answerInsights: string[] = [];
    if (args.answerId) {
      const result = await applyAnswer(ctx, group, playerId, args.answerId);
      credited = result.credited;
      opened = result.opened;
      answerInsights = result.hits;
    }
    const progress = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).collect();
    const found = new Set(progress.map((p) => p.insightKey));
    const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const unlocks = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    let state = await ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", group!._id)).unique();
    const lastProgressDay = Math.max(1, ...progress.map((p) => p.day), ...(credited ? [group.day] : []), state?.lastProgressDay ?? 1);
    if (!state) {
      const id = await ctx.db.insert("storyStates", { groupId: group._id, version: 0, act: 0, doneBeats: [], flags: {}, lastProgressDay });
      state = (await ctx.db.get(id))!;
    }
    const snapshot = { day: group.day, act: state.act, version: state.version, doneBeats: state.doneBeats,
      flags: state.flags, creditedInsights: [...found], unlockedClues: unlocks.map((u) => u.clueKey) };
    const beat = selectEligibleBeat(snapshot, storyInstance ? [] : content.beats);
    let act = state.act;
    let doneBeats = state.doneBeats;
    let flags = state.flags;
    if (beat) {
      const players = await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", group!._id)).collect();
      const casts = (await Promise.all(players.map((p) => ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", p._id)).collect()))).flat()
        .filter((cast): cast is typeof cast & { lineId: "2" | "3" } => cast.lineId === "2" || cast.lineId === "3");
      const transition = planStoryTransition(snapshot, content.beats, beat.key, players.map((p) => p._id), casts);
      if (transition.expectedVersion !== state.version || transition.effects.some((effect) => effect.kind === "cast" || effect.kind === "trust")) throw new Error("Unsupported story transition");
      for (const effect of transition.effects) {
        if (effect.kind === "flag") flags = { ...flags, [effect.key]: effect.value };
        if (effect.kind === "unlockClue") {
          if (!clues.some((clue) => clue.key === effect.clueKey)) throw new Error("Unknown story clue");
          if (!unlocks.some((unlock) => unlock.clueKey === effect.clueKey)) {
            if (!await unlockClueImpl(ctx, group, effect.clueKey)) throw new Error("Story clue is not eligible");
            opened.push(clues.find((clue) => clue.key === effect.clueKey)!);
          }
        }
      }
      act = transition.nextAct;
      doneBeats = [...doneBeats, transition.beatKey];
    }
    const currentUnlocks = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group!._id)).collect();
    const unlocked = new Set(currentUnlocks.map((u) => u.clueKey));
    const sheet = Object.hasOwn(content.characters, character.agentKey) ? content.characters[character.agentKey] : undefined;
    const directive = buildScriptedDirective({ lineId, context: { recipientId: playerId, character, publicIdentity: sheet?.publicIdentity ?? "", publicVoice: sheet?.publicVoice ?? "",
      facts: clues.filter((clue) => unlocked.has(clue.key) && sheet?.clueKeys.includes(clue.key)).map((clue) => ({ text: `${clue.name}: ${clue.summary}`, audience: "group" as const, unlocked: true })) },
      teamEvents: [...found].map((insightKey) => ({ kind: "creditedInsight" as const, insightKey })),
      publicTeamCatalog: { playerNames: {}, characterNames: {}, creditedInsightLabels: content.insightLabels, decisionLabels: {} } });
    directive.guidance = `Scripted guidance (no live model):\n${directive.guidance}`;
    const latestGroup = (await ctx.db.get(group._id))!;
    directive.progressDelta = latestGroup.progress - before;
    const reveal = [...opened, ...clues.filter((clue) => "insight" in clue.unlock && answerInsights.includes(clue.unlock.insight))]
      .find((clue) => unlocked.has(clue.key) && sheet?.clueKeys.includes(clue.key));
    if (reveal) directive.reveal = { clueId: reveal._id, text: `${reveal.name}: ${reveal.summary}` };
    let lastStallDay = state.lastStallDay;
    let questionKey: string | undefined;
    if (!credited && group.day > lastProgressDay && lastStallDay !== group.day) {
      const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group!.caseId).eq("day", group!.day)).collect();
      const answers = await ctx.db.query("answers").withIndex("by_player_day", (q) => q.eq("playerId", playerId).eq("day", group!.day)).collect();
      const question = questions.find((q) => !answers.some((answer) => answer.questionKey === q.key));
      if (question) { directive.nextQuestion = question.prompt; questionKey = question.key; lastStallDay = group.day; }
    }
    await ctx.db.patch(state._id, { version: state.version + 1, act, doneBeats, flags, lastProgressDay, lastStallDay });
    const clueKeys = clues.filter((clue) => unlocked.has(clue.key) && sheet?.clueKeys.includes(clue.key)).map((clue) => clue.key);
    if (reveal && !clueKeys.includes(reveal.key)) clueKeys.push(reveal.key);
    const insightKeys = lineId === "1" ? [...found].filter((key) => Object.hasOwn(content.insightLabels, key)).slice(0, 2) : [];
    const contentJson = JSON.stringify({ clues: clueKeys.map((key) => {
      const clue = clues.find((item) => item.key === key)!;
      return { key, id: clue._id, name: clue.name, summary: clue.summary };
    }), labels: insightKeys.map((key) => content.insightLabels[key]), questionPrompt: directive.nextQuestion ?? null });
    await ctx.db.insert("storyEvents", { groupId: group._id, caseId: group.caseId, playerId, messageId: args.messageId, lineId, answerId: args.answerId, questionKey, questionDay: questionKey ? group.day : undefined, sheetJson: JSON.stringify(sheet ?? null), contentJson, clueKeys, insightKeys, directiveJson: JSON.stringify(directive), dailyTurn: admitted?.turn, dailyTurnDay: admitted ? group.day : undefined, dailyTurnLimit: admitted?.limit });
    return directive;
  },
});

export const applyDecision = internalMutation({
  args: { groupId: v.id("groups"), decisionKey: v.string(), expectedVersion: v.number() },
  returns: v.null(),
  handler: async (ctx, { groupId, expectedVersion }) => {
    const state = await ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique();
    if (!state || state.version !== expectedVersion) throw new Error("Stale story version");
    throw new Error("No reviewed decision contract is available");
  },
});
