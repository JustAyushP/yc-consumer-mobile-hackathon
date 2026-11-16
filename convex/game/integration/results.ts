import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../../_generated/dataModel";
import { SF_CONTENT_REVISION } from "../../cases/sfCandidate";
import { isSfBound, verifiedSfGroup } from "./sf";

const processAnswer = makeFunctionReference<"mutation", { answerId: Id<"answers"> }, null>("game/engine:processAnswer");

export const recoverAnswer = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), messageId: v.id("messages"), answerId: v.id("answers"), lineId: v.string() },
  handler: async (ctx, args) => {
    const [group, player, message, answer, receipt] = await Promise.all([
      ctx.db.get(args.groupId), ctx.db.get(args.playerId), ctx.db.get(args.messageId), ctx.db.get(args.answerId),
      ctx.db.query("commandReceipts").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).unique(),
    ]);
    if (!group || group.status !== "active" || !player || player.groupId !== group._id || !message || message.groupId !== group._id ||
      message.playerId !== player._id || message.source !== "keiki" || message.kind !== "chat" || message.lineId !== args.lineId ||
      !["1", "2", "3"].includes(args.lineId) || message.intakeCaseId !== group.caseId || message.answerId !== args.answerId ||
      !answer || answer.groupId !== group._id || answer.playerId !== player._id || answer.day !== message.intakeDay ||
      !receipt || receipt.groupId !== group._id || receipt.caseId !== group.caseId || receipt.playerId !== player._id || receipt.lineId !== args.lineId ||
      receipt.day !== answer.day || receipt.command.kind !== "answer" || receipt.command.questionKey !== answer.questionKey || receipt.command.text.trim() !== answer.text ||
      receipt.result.kind !== "answer" || receipt.result.value !== answer._id) throw new Error("Unverifiable answer provenance");
    const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", answer.day)).collect();
    if (!questions.some((question) => question.key === answer.questionKey)) throw new Error("Invalid answer case");
    if (answer.score === undefined) await ctx.runMutation(processAnswer, { answerId: answer._id });
    return null;
  },
});

export const solvedResult = internalQuery({
  args: { groupId: v.id("groups"), playerId: v.id("players"), messageId: v.id("messages"), lineId: v.string() },
  returns: v.union(v.null(), v.object({ correct: v.literal(true), reveal: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const [group, player, message, receipt] = await Promise.all([
      ctx.db.get(args.groupId), ctx.db.get(args.playerId), ctx.db.get(args.messageId),
      ctx.db.query("commandReceipts").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).unique(),
    ]);
    if (args.lineId !== "1" || !group || group.status !== "solved" || group.solvedBy !== args.playerId || !player || player.groupId !== group._id ||
      !message || message.groupId !== group._id || message.playerId !== player._id || message.kind !== "chat" || message.source !== "keiki" ||
      message.lineId !== "1" || (message.agentKey !== undefined && message.agentKey !== "common") || message.intakeCaseId !== group.caseId || message.intakeDay !== group.solvedDay ||
      !receipt || receipt.groupId !== group._id || receipt.caseId !== group.caseId || receipt.playerId !== player._id || receipt.lineId !== "1" || receipt.day !== group.solvedDay ||
      receipt.command.kind !== "accusation" || receipt.result.kind !== "accusation" || !receipt.result.value.correct) return null;
    const caseRecord = await ctx.db.get(group.caseId);
    if (!caseRecord || receipt.command.suspectKey !== caseRecord.culpritKey) return null;
    if (caseRecord.contentRevision === SF_CONTENT_REVISION || await isSfBound(ctx, group._id, group.caseId)) {
      const segments = await ctx.db.query("brainSegments").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique();
      if (!segments || segments.index !== 7 || !segments.completed || !segments.definitions[6]?.accusationEligible || !await verifiedSfGroup(ctx, group._id, group.caseId)) return null;
    }
    return { correct: true as const, reveal: caseRecord.reveal };
  },
});
