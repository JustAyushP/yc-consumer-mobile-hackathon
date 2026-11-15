import { v } from "convex/values";
import { query } from "../_generated/server";
import { loadPlayer } from "./lib";

/** Evidence board: unlocked clues, all suspects, and the deductions the team has made. */
export const get = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const { group } = await loadPlayer(ctx, playerId);
    const unlocks = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const found = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const kase = (await ctx.db.get(group.caseId))!;
    return {
      case: { title: kase.title, setting: kase.setting, victim: kase.victim, logline: kase.logline },
      clues: unlocks.map((u) => {
        const c = clues.find((x) => x.key === u.clueKey)!;
        return { key: c.key, name: c.name, kind: c.kind, summary: c.summary, day: u.day };
      }),
      suspects: suspects.map((s) => ({ key: s.key, name: s.name, title: s.title, bio: s.bio })),
      deductions: found.map((f) => ({ key: f.insightKey, label: insights.find((i) => i.key === f.insightKey)?.label ?? f.insightKey, by: f.playerId ?? null, day: f.day })),
      progress: group.progress,
    };
  },
});
