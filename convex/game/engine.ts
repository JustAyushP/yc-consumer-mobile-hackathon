import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { internalMutation, MutationCtx } from "../_generated/server";
import { groupPlayers, hintsLeft, weekOf } from "./lib";
import { vMessageKind } from "../schema";

// Engine mutations: the only way game state changes. RAVO calls these, never the tables directly.

function say(ctx: MutationCtx, groupId: Id<"groups">, kind: Doc<"messages">["kind"], body: string, playerId?: Id<"players">) {
  return ctx.db.insert("narration", { groupId, kind, body, playerId });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function projectedDay(group: Doc<"groups">) {
  if (group.status !== "active" || group.dayOpenedAt === undefined) return group.day;
  const elapsed = Date.now() + (group.gameTimeOffsetMs ?? 0) - group.dayOpenedAt;
  const due = Math.max(0, Math.floor(elapsed / DAY_MS));
  if (due >= 8) throw new Error("The case clock is catching up. Try again shortly.");
  return group.day + due;
}

export const addNarration = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.optional(v.id("players")), kind: vMessageKind, body: v.string() },
  returns: v.id("narration"),
  handler: async (ctx, args) => {
    if (!await ctx.db.get(args.groupId) || (args.playerId && (await ctx.db.get(args.playerId))?.groupId !== args.groupId)) throw new Error("Invalid narration audience");
    return await ctx.db.insert("narration", args);
  },
});

export async function unlockClueImpl(ctx: MutationCtx, group: Doc<"groups">, clueKey: string) {
  const have = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  if (have.some((u) => u.clueKey === clueKey)) return false;
  const clue = (await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect()).find((c) => c.key === clueKey);
  if (!clue) throw new Error(`Unknown clue ${clueKey}`);
  if ("day" in clue.unlock && clue.unlock.day > group.day) return false;
  if ("insight" in clue.unlock) {
    const progress = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const insightKey = clue.unlock.insight;
    if (!progress.some((p) => p.insightKey === insightKey)) return false;
  }
  await ctx.db.insert("clueUnlocks", { groupId: group._id, clueKey, day: group.day });
  await say(ctx, group._id, "clue", `${clue.name}: ${clue.summary}`);
  return true;
}

export async function openDayImpl(ctx: MutationCtx, group: Doc<"groups">, day: number, openedAt = Date.now() + (group.gameTimeOffsetMs ?? 0)) {
  await ctx.db.patch(group._id, { status: "active", day, dayOpenedAt: openedAt });
  const info = await ctx.db.query("days").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", day)).first();
  await say(ctx, group._id, "day", info ? `Day ${day}: ${info.title}. ${info.briefing}` : `Day ${day}. The trail is cold. Make your accusation.`);
  const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
  for (const c of clues) if ("day" in c.unlock && c.unlock.day <= day) await unlockClueImpl(ctx, { ...group, day }, c.key);
}

export const unlockClue = internalMutation({
  args: { groupId: v.id("groups"), clueKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { groupId, clueKey }) => {
    let group = await ctx.db.get(groupId);
    if (!group || group.status !== "active") return false;
    group = await currentGroup(ctx, group);
    return await unlockClueImpl(ctx, group, clueKey);
  },
});

export const recordInsight = internalMutation({
  args: { groupId: v.id("groups"), insightKey: v.string(), playerId: v.optional(v.id("players")) },
  returns: v.boolean(),
  handler: async (ctx, { groupId, insightKey, playerId }) => {
    let group = await ctx.db.get(groupId);
    if (!group || group.status !== "active") return false;
    if (playerId && (await ctx.db.get(playerId))?.groupId !== groupId) return false;
    group = await currentGroup(ctx, group);
    const found = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
    if (found.some((p) => p.insightKey === insightKey)) return false;
    const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    if (!insights.some((i) => i.key === insightKey)) return false;
    await ctx.db.insert("progress", { groupId, insightKey, playerId, day: group.day });
    const keys = new Set([...found.map((f) => f.insightKey), insightKey]);
    const total = insights.reduce((s, i) => s + i.weight, 0);
    const got = insights.filter((i) => keys.has(i.key)).reduce((s, i) => s + i.weight, 0);
    await ctx.db.patch(groupId, { progress: total > 0 ? Math.round((got / total) * 100) : 0 });
    return true;
  },
});

export const giveHint = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), insightKey: v.string(), body: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { groupId, playerId, insightKey, body }) => {
    let group = await ctx.db.get(groupId);
    if (!group || group.status !== "active" || (await ctx.db.get(playerId))?.groupId !== groupId) return false;
    group = await currentGroup(ctx, group);
    if ((await hintsLeft(ctx, group)) <= 0) return false;
    await ctx.db.insert("hints", { groupId, playerId, week: weekOf(group.day), day: group.day, insightKey, body });
    await say(ctx, groupId, "hint", body, playerId);
    return true;
  },
});

export const issueWarning = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), kind: v.union(v.literal("lagging"), v.literal("missed")), body: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { groupId, playerId, kind, body }) => {
    let group = await ctx.db.get(groupId);
    if (!group || group.status !== "active" || (await ctx.db.get(playerId))?.groupId !== groupId) return false;
    group = await currentGroup(ctx, group);
    const prior = await ctx.db.query("warnings").withIndex("by_player", (q) => q.eq("playerId", playerId)).collect();
    if (prior.some((w) => w.day === group.day && w.kind === kind)) return false;
    await ctx.db.insert("warnings", { groupId, playerId, day: group.day, kind });
    await say(ctx, groupId, "warning", body, playerId);
    return true;
  },
});

async function closeDay(ctx: MutationCtx, group: Doc<"groups">, nextOpenedAt: number) {
  const players = await groupPlayers(ctx, group._id);
  const sessions = await ctx.db.query("sessions").withIndex("by_group_day", (q) => q.eq("groupId", group._id).eq("day", group.day)).collect();
  for (const player of players) {
    if (!player.roleKey || player.joinedDay > group.day) continue;
    const session = sessions.find((s) => s.playerId === player._id);
    if (session?.completed) continue;
    if (session) await ctx.db.patch(session._id, { status: "missed" });
    else await ctx.db.insert("sessions", { groupId: group._id, playerId: player._id, day: group.day, completed: false, status: "missed" });
    const warnings = await ctx.db.query("warnings").withIndex("by_player", (q) => q.eq("playerId", player._id)).collect();
    if (warnings.some((w) => w.groupId === group._id && w.day === group.day && w.kind === "missed")) continue;
    await ctx.db.insert("warnings", { groupId: group._id, playerId: player._id, day: group.day, kind: "missed" });
    await say(ctx, group._id, "warning", `Detective ${player.name} missed Day ${group.day}. Lack of progress noted.`, player._id);
  }
  await openDayImpl(ctx, group, group.day + 1, nextOpenedAt);
}

export async function rolloverDue(ctx: MutationCtx, group: Doc<"groups">) {
  if (group.status !== "active") return false;
  const now = Date.now() + (group.gameTimeOffsetMs ?? 0);
  if (group.dayOpenedAt === undefined) {
    await ctx.db.patch(group._id, { dayOpenedAt: now });
    return false;
  }
  let current = group;
  for (let count = 0; count < 7 && now >= current.dayOpenedAt! + DAY_MS; count++) {
    await closeDay(ctx, current, current.dayOpenedAt! + DAY_MS);
    current = (await ctx.db.get(group._id))!;
  }
  return now >= current.dayOpenedAt! + DAY_MS;
}

export async function currentGroup(ctx: MutationCtx, group: Doc<"groups">) {
  if (group.status !== "active") return group;
  const now = Date.now() + (group.gameTimeOffsetMs ?? 0);
  if (group.dayOpenedAt !== undefined && now - group.dayOpenedAt >= 8 * DAY_MS) throw new Error("The case clock is catching up. Try again shortly.");
  await rolloverDue(ctx, group);
  return (await ctx.db.get(group._id))!;
}

export const fastForwardDay = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    let group = await ctx.db.get(groupId);
    if (!group || group.status !== "active") return null;
    group = await currentGroup(ctx, group);
    const now = Date.now() + (group.gameTimeOffsetMs ?? 0);
    const boundary = (group.dayOpenedAt ?? now) + DAY_MS;
    await ctx.db.patch(groupId, { gameTimeOffsetMs: (group.gameTimeOffsetMs ?? 0) + Math.max(0, boundary - now) });
    await closeDay(ctx, group, boundary);
    return null;
  },
});

/** Demo control, run from a terminal: scripts/fast-forward.sh <JOIN_CODE>. */
export const fastForwardByCode = internalMutation({
  args: { joinCode: v.string() },
  returns: v.number(),
  handler: async (ctx, { joinCode }) => {
    const group = await ctx.db.query("groups").withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode.trim().toUpperCase())).first();
    if (!group) throw new Error(`No group with join code ${joinCode}`);
    await ctx.runMutation(internal.game.engine.fastForwardDay, { groupId: group._id });
    return (await ctx.db.get(group._id))!.day;
  },
});
