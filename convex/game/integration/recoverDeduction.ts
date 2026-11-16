import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation } from "../../_generated/server";
import { SF_CONTENT_REVISION } from "../../cases/sfCandidate";
import { matchInsights } from "../../ravo/scoring";
import { currentGroup, unlockClueImpl } from "../engine";
import { verifiedSfGroup } from "./sf";
import { sfInsightEligible } from "./sfEvidence";
import { dailyStatus } from "./daily";

const recordInsight = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; insightKey: string }, boolean>("game/engine:recordInsight");

export const recoverDeduction = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), messageId: v.id("messages"), insightKey: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    let group = await ctx.db.get(args.groupId);
    const [player, message, receipt] = await Promise.all([
      ctx.db.get(args.playerId), ctx.db.get(args.messageId),
      ctx.db.query("brainRecoveryReceipts").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).unique(),
    ]);
    if (!group || group.status !== "active" || !player || player.groupId !== group._id || !message || message.groupId !== group._id || message.playerId !== player._id ||
      message.kind !== "chat" || message.source !== "keiki" || message.lineId !== "1" || message.agentKey !== "common" || message.answerId ||
      !args.text.trim() || args.text.length > 2000) throw new Error("Invalid recovery association");
    group = await currentGroup(ctx, group);
    const caseRecord = await ctx.db.get(group.caseId);
    if (!caseRecord || caseRecord.contentRevision !== SF_CONTENT_REVISION || message.intakeCaseId !== group.caseId || message.intakeDay !== group.day ||
      !await verifiedSfGroup(ctx, group._id, group.caseId) || !await sfInsightEligible(ctx, group, args.insightKey)) throw new Error("Recovery is not authorized");
    const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group!.caseId)).collect();
    if (!questions.some((question) => question.day <= group!.day && question.insightKeys.includes(args.insightKey))) throw new Error("Recovery is not available yet");
    if (receipt) {
      if (receipt.groupId !== group._id || receipt.caseId !== group.caseId || receipt.playerId !== player._id || receipt.day !== group.day ||
        receipt.insightKey !== args.insightKey || receipt.text !== args.text || receipt.messageBody !== message.body) throw new Error("Conflicting recovery receipt");
      if (receipt.credited && !(await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group!._id)).collect()).some((item) => item.insightKey === args.insightKey)) throw new Error("Recovery entitlement changed");
      return { credited: receipt.credited };
    }
    if (await ctx.db.query("storyEvents").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).first() ||
      await ctx.db.query("commandReceipts").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).first()) throw new Error("Message already associated");
    const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group!.caseId)).collect();
    const hit = matchInsights(insights.filter((insight) => insight.key === args.insightKey), args.text).includes(args.insightKey);
    const credited = hit && await ctx.runMutation(recordInsight, { groupId: group._id, playerId: player._id, insightKey: args.insightKey });
    if (credited) {
      const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group!.caseId)).collect();
      for (const clue of clues) if ("insight" in clue.unlock && clue.unlock.insight === args.insightKey) await unlockClueImpl(ctx, group, clue.key);
    }
    const daily = credited ? await dailyStatus(ctx, group, player._id) : null;
    await ctx.db.insert("brainRecoveryReceipts", { groupId: group._id, caseId: group.caseId, playerId: player._id, messageId: args.messageId,
      day: group.day, insightKey: args.insightKey, text: args.text, messageBody: message.body, credited,
      dailyTurn: daily?.counter?.turns, dailyTurnLimit: daily?.limit });
    return { credited };
  },
});
