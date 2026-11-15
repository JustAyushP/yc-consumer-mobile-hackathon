import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

/** Deterministic deduction matcher: every keyword group must have one hit (word-prefix match). */
export function matchInsights(insights: Doc<"insights">[], text: string) {
  const norm = " " + text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9:.$ ]+/g, " ") + " ";
  const hit = (k: string) => (/[ .:]/.test(k) ? norm.includes(k) : new RegExp("(^|[^a-z0-9])" + k).test(norm));
  return insights.filter((i) => i.keywords.every((g) => g.some(hit))).map((i) => i.key);
}

/** Everything RAVO needs to judge a chat message or an answer. */
export const context = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const group = (await ctx.db.get(groupId))!;
    const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const found = (await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect()).map((p) => p.insightKey);
    return { group, insights, found };
  },
});

export const answerContext = internalQuery({
  args: { answerId: v.id("answers") },
  handler: async (ctx, { answerId }) => {
    const answer = await ctx.db.get(answerId);
    if (!answer) return null;
    const group = (await ctx.db.get(answer.groupId))!;
    const player = (await ctx.db.get(answer.playerId))!;
    const question = await ctx.db
      .query("questions")
      .withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", answer.day))
      .filter((q) => q.eq(q.field("key"), answer.questionKey))
      .first();
    return { answer, player, question };
  },
});

export const saveVerdict = internalMutation({
  args: { answerId: v.id("answers"), score: v.number(), verdict: v.string() },
  returns: v.null(),
  handler: async (ctx, { answerId, score, verdict }) => {
    await ctx.db.patch(answerId, { score, verdict });
    return null;
  },
});
