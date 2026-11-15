import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const COMMON_LINE = "1";
export const COMMON_CHARACTER = { agentKey: "common", name: "Sal, the night bartender" };

/**
 * Which character a player gets on a Keiki line. Line 1 is the common character for everyone.
 * Lines 2 and 3 get a suspect, assigned deterministically by join order and recorded in `casts`.
 */
export const assign = internalMutation({
  args: { playerId: v.id("players"), lineId: v.string() },
  returns: v.object({ agentKey: v.string(), name: v.string() }),
  handler: async (ctx, { playerId, lineId }) => {
    if (lineId === COMMON_LINE) return COMMON_CHARACTER;
    const player = (await ctx.db.get(playerId))!;
    const group = (await ctx.db.get(player.groupId))!;
    const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const existing = await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", playerId).eq("lineId", lineId)).first();
    if (existing) return { agentKey: existing.agentKey, name: suspects.find((s) => s.key === existing.agentKey)?.name ?? existing.agentKey };
    const order = (await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect()).findIndex((p) => p._id === playerId);
    const slot = Number(lineId) === 3 ? 1 : 0;
    const suspect = suspects[(order * 2 + slot) % suspects.length];
    await ctx.db.insert("casts", { groupId: group._id, playerId, lineId, agentKey: suspect.key });
    return { agentKey: suspect.key, name: suspect.name };
  },
});
