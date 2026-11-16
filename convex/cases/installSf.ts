import { internalMutation } from "../_generated/server";
import { SF_CASE_CANDIDATE, SF_CONTENT_REVISION } from "./sfCandidate";

export const installIsolatedSf = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("cases").withIndex("by_key", (q) => q.eq("key", SF_CASE_CANDIDATE.key)).collect();
    if (existing.length || await ctx.db.query("cases").first() || await ctx.db.query("groups").first()) throw new Error("Empty game dataset required");
    const { suspects, clues, insights, days, ...fields } = SF_CASE_CANDIDATE;
    const caseId = await ctx.db.insert("cases", { ...fields, contentRevision: SF_CONTENT_REVISION });
    for (const { id, ...suspect } of suspects) await ctx.db.insert("suspects", { caseId, key: id, ...suspect });
    for (const { id, ...clue } of clues) await ctx.db.insert("clues", { caseId, key: id, ...clue });
    for (const { id, ...insight } of insights) await ctx.db.insert("insights", { caseId, key: id, ...insight });
    for (const { questions, ...day } of days) {
      await ctx.db.insert("days", { caseId, ...day });
      for (const { id, insights: insightKeys, ...question } of questions) await ctx.db.insert("questions", { caseId, day: day.day, key: id, insightKeys, ...question });
    }
    return caseId;
  },
});
