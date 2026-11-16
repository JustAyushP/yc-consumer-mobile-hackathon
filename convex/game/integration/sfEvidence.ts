import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { segmentAccess } from "./access";

export const SF_INSIGHT_EVIDENCE: Readonly<Record<string, readonly string[]>> = {
  i_poison: ["e_glass"], i_lipstick: ["e_lipstick"], i_leo: ["e_taxi"], i_mk: ["e_note"],
  i_ledger: ["e_ledger"], i_source: ["e_prescription"], i_timeline: ["e_cloak"],
};

export async function sfInsightEligible(ctx: QueryCtx, group: Doc<"groups">, insightKey: string) {
  const evidence = SF_INSIGHT_EVIDENCE[insightKey];
  if (!evidence) return false;
  const segment = await segmentAccess(ctx, group);
  if (!segment || evidence.some((key) => !segment.clueKeys.includes(key))) return false;
  const [unlocks, questions] = await Promise.all([
    ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId)).collect(),
  ]);
  return evidence.every((key) => unlocks.some((item) => item.clueKey === key)) && questions.some((question) => question.day <= group.day && segment.questionKeys.includes(question.key) && question.insightKeys.includes(insightKey));
}
