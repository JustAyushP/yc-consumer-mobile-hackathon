import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { internalMutation, MutationCtx } from "../_generated/server";
import { groupPlayers, hintsLeft, weekOf } from "./lib";

// Engine mutations: the only way game state changes. RAVO calls these, never the tables directly.

function say(ctx: MutationCtx, groupId: Id<"groups">, kind: Doc<"messages">["kind"], body: string, playerId?: Id<"players">, meta?: string) {
  return ctx.scheduler.runAfter(0, internal.chat.messages.postRavoMessage, { groupId, kind, body, playerId, meta });
}

export async function unlockClueImpl(ctx: MutationCtx, group: Doc<"groups">, clueKey: string) {
  const have = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  if (have.some((u) => u.clueKey === clueKey)) return false;
  const clue = (await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect()).find((c) => c.key === clueKey);
  if (!clue) throw new Error(`Unknown clue ${clueKey}`);
  await ctx.db.insert("clueUnlocks", { groupId: group._id, clueKey, day: group.day });
  await say(ctx, group._id, "clue", `${clue.name}: ${clue.summary}`, undefined, clueKey);
  return true;
}

export async function openDayImpl(ctx: MutationCtx, group: Doc<"groups">, day: number) {
  await ctx.db.patch(group._id, { status: "active", day });
  const info = await ctx.db.query("days").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", day)).first();
  await say(ctx, group._id, "day", info ? `Day ${day}: ${info.title}. ${info.briefing}` : `Day ${day}. The trail is cold. Make your accusation.`, undefined, String(day));
  const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
  for (const c of clues) if ("day" in c.unlock && c.unlock.day <= day) await unlockClueImpl(ctx, { ...group, day }, c.key);
}

export const unlockClue = internalMutation({
  args: { groupId: v.id("groups"), clueKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { groupId, clueKey }) => {
    const group = await ctx.db.get(groupId);
    if (!group) return false;
    return await unlockClueImpl(ctx, group, clueKey);
  },
});

export const recordInsight = internalMutation({
  args: { groupId: v.id("groups"), insightKey: v.string(), playerId: v.optional(v.id("players")) },
  returns: v.boolean(),
  handler: async (ctx, { groupId, insightKey, playerId }) => {
    const group = await ctx.db.get(groupId);
    if (!group || group.status !== "active") return false;
    const found = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
    if (found.some((p) => p.insightKey === insightKey)) return false;
    const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    if (!insights.some((i) => i.key === insightKey)) return false;
    await ctx.db.insert("progress", { groupId, insightKey, playerId, day: group.day });
    const keys = new Set([...found.map((f) => f.insightKey), insightKey]);
    const total = insights.reduce((s, i) => s + i.weight, 0);
    const got = insights.filter((i) => keys.has(i.key)).reduce((s, i) => s + i.weight, 0);
    await ctx.db.patch(groupId, { progress: Math.round((got / total) * 100) });
    return true;
  },
});

export const giveHint = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), insightKey: v.string(), body: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { groupId, playerId, insightKey, body }) => {
    const group = await ctx.db.get(groupId);
    if (!group || (await hintsLeft(ctx, group)) <= 0) return false;
    await ctx.db.insert("hints", { groupId, playerId, week: weekOf(group.day), day: group.day, insightKey, body });
    await say(ctx, groupId, "hint", body, playerId);
    return true;
  },
});

export const issueWarning = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), kind: v.union(v.literal("lagging"), v.literal("missed")), body: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { groupId, playerId, kind, body }) => {
    const group = await ctx.db.get(groupId);
    if (!group) return false;
    const prior = await ctx.db.query("warnings").withIndex("by_player", (q) => q.eq("playerId", playerId)).collect();
    if (prior.some((w) => w.day === group.day && w.kind === kind)) return false;
    await ctx.db.insert("warnings", { groupId, playerId, day: group.day, kind });
    await say(ctx, groupId, "warning", body, playerId, kind);
    return true;
  },
});

export const fastForwardDay = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get(groupId);
    if (!group || group.status !== "active") return null;
    const players = await groupPlayers(ctx, groupId);
    const done = await ctx.db.query("sessions").withIndex("by_group_day", (q) => q.eq("groupId", groupId).eq("day", group.day)).collect();
    for (const p of players) {
      if (!p.roleKey || p.joinedDay > group.day || done.some((s) => s.playerId === p._id && s.completed)) continue;
      await ctx.db.insert("warnings", { groupId, playerId: p._id, day: group.day, kind: "missed" });
      await say(ctx, groupId, "warning", `Detective ${p.name} missed Day ${group.day}. Lack of progress noted.`, p._id, "missed");
    }
    await openDayImpl(ctx, group, group.day + 1);
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
    return group.day + 1;
  },
});
