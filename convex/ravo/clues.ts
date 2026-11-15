import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { unlockClueImpl } from "../game/engine";

/** Unfolds every clue whose insight gate the team has now reached. Returns the clue keys it unlocked. */
export const unfold = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.array(v.string()),
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get(groupId);
    if (!group || group.status !== "active") return [];
    const found = new Set((await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect()).map((p) => p.insightKey));
    const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const opened: string[] = [];
    for (const c of clues) {
      const due = "day" in c.unlock ? c.unlock.day <= group.day : found.has(c.unlock.insight);
      if (due && (await unlockClueImpl(ctx, group, c.key))) opened.push(c.key);
    }
    return opened;
  },
});
