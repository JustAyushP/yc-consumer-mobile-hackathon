import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { hintsLeft, loadPlayer } from "../game/lib";

/** A player asks RAVO for a hint. Max 3 per group per week, enforced by game.engine.giveHint. */
export const request = mutation({
  args: { playerId: v.id("players") },
  returns: v.object({ given: v.boolean(), hintsLeft: v.number() }),
  handler: async (ctx, { playerId }): Promise<{ given: boolean; hintsLeft: number }> => {
    const { group } = await loadPlayer(ctx, playerId);
    if (group.status !== "active") throw new Error("The case isn't open");
    const left = await hintsLeft(ctx, group);
    if (left <= 0) return { given: false, hintsLeft: 0 };
    const found = new Set((await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect()).map((p) => p.insightKey));
    const next = (await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect()).find((i) => !found.has(i.key));
    if (!next) return { given: false, hintsLeft: left };
    const given: boolean = await ctx.runMutation(internal.game.engine.giveHint, { groupId: group._id, playerId, insightKey: next.key, body: next.hint });
    return { given, hintsLeft: given ? left - 1 : left };
  },
});
