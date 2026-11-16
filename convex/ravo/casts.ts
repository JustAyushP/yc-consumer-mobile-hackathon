import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internalMutation, MutationCtx } from "../_generated/server";

export const COMMON_LINE = "1";
export const COMMON_CHARACTER = { agentKey: "common", name: "Sal, the night bartender" };

/**
 * Which character a player gets on a Keiki line. Line 1 is the common character for everyone.
 * Lines 2 and 3 get a suspect, assigned deterministically by join order and recorded in `casts`.
 */
export async function assignImpl(ctx: MutationCtx, playerId: Id<"players">, lineId: string, expectedAgentKey?: string) {
    if (lineId !== "1" && lineId !== "2" && lineId !== "3") throw new Error("Invalid conversation");
    if (lineId === COMMON_LINE) {
      if (expectedAgentKey && expectedAgentKey !== COMMON_CHARACTER.agentKey) throw new Error("Invalid conversation");
      return COMMON_CHARACTER;
    }
    const player = (await ctx.db.get(playerId))!;
    const group = (await ctx.db.get(player.groupId))!;
    const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const existing = await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", playerId).eq("lineId", lineId)).first();
    if (existing) {
      const suspect = suspects.find((s) => s.key === existing.agentKey);
      if (existing.groupId !== group._id || !suspect || (expectedAgentKey && expectedAgentKey !== existing.agentKey)) throw new Error("Invalid conversation");
      return { agentKey: existing.agentKey, name: suspect.name };
    }
    const order = (await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect()).findIndex((p) => p._id === playerId);
    const slot = Number(lineId) === 3 ? 1 : 0;
    const suspect = suspects[(order * 2 + slot) % suspects.length];
    if (!suspect || (expectedAgentKey && expectedAgentKey !== suspect.key)) throw new Error("Invalid conversation");
    await ctx.db.insert("casts", { groupId: group._id, playerId, lineId, agentKey: suspect.key });
    return { agentKey: suspect.key, name: suspect.name };
}

export const assign = internalMutation({
  args: { playerId: v.id("players"), lineId: v.string() },
  returns: v.object({ agentKey: v.string(), name: v.string() }),
  handler: async (ctx, { playerId, lineId }) => await assignImpl(ctx, playerId, lineId),
});

export const assignForConsult = internalMutation({
  args: { playerId: v.id("players"), lineId: v.string(), agentKey: v.optional(v.string()) },
  returns: v.object({ agentKey: v.string(), name: v.string() }),
  handler: async (ctx, { playerId, lineId, agentKey }) => await assignImpl(ctx, playerId, lineId, agentKey),
});
