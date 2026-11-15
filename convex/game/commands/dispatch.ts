import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";
import { SURVEY } from "../catalog";
import { projectedDay } from "../engine";
import { assignImpl } from "../../ravo/casts";

const command = v.union(
  v.object({ kind: v.literal("survey"), answers: v.array(v.object({ questionKey: v.string(), optionIndex: v.number() })) }),
  v.object({ kind: v.literal("answer"), questionKey: v.string(), text: v.string() }),
  v.object({ kind: v.literal("ability"), targetKey: v.string() }),
  v.object({ kind: v.literal("hint"), insightKey: v.string() }),
  v.object({ kind: v.literal("accusation"), suspectKey: v.string(), reasoning: v.string() }),
);

export const dispatch = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), messageId: v.id("messages"), lineId: v.string(), caseId: v.id("cases"), day: v.number(), command },
  returns: v.union(
    v.object({ kind: v.literal("answer"), answerId: v.id("answers") }),
    v.object({ kind: v.literal("unsupported"), command: v.union(v.literal("survey"), v.literal("ability"), v.literal("hint"), v.literal("accusation")) }),
  ),
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId);
    const player = await ctx.db.get(args.playerId);
    const message = await ctx.db.get(args.messageId);
    if (!group || !await ctx.db.get(group.caseId) || !player || player.groupId !== group._id || !message || message.groupId !== group._id ||
        message.playerId !== player._id || message.source !== "keiki" || message.kind !== "chat" ||
        !["1", "2", "3"].includes(args.lineId) || message.lineId !== args.lineId) throw new Error("Invalid command association");
    if (group.caseId !== args.caseId || !Number.isInteger(args.day) || projectedDay(group) !== args.day) throw new Error("Stale command context");

    if (args.command.kind === "survey") {
      const answers = args.command.answers;
      if (answers.length !== SURVEY.length || new Set(answers.map((answer) => answer.questionKey)).size !== SURVEY.length ||
          answers.some((answer) => {
            const question = SURVEY.find((item) => item.id === answer.questionKey);
            return !question || !Number.isInteger(answer.optionIndex) || answer.optionIndex < 0 || answer.optionIndex >= question.options.length;
          })) throw new Error("Invalid survey answers");
      return { kind: "unsupported" as const, command: "survey" as const };
    }
    if (args.command.kind !== "answer") return { kind: "unsupported" as const, command: args.command.kind };

    if (group.status !== "active") throw new Error("The case isn't open");
    if (group.dayOpenedAt !== undefined && !group.gameTimeOffsetMs && projectedDay(group) === group.day && message._creationTime < group.dayOpenedAt) {
      throw new Error("Message predates the current day");
    }
    if (message.answerId || await ctx.db.query("storyEvents").withIndex("by_message", (q) => q.eq("messageId", message._id)).first()) {
      throw new Error("Message already associated; retry requires a command receipt");
    }
    const answerCommand = args.command;
    const day = projectedDay(group);
    const text = answerCommand.text.trim();
    if (!text) throw new Error("Answer must not be empty");
    const prior = await ctx.db.query("answers").withIndex("by_player_day", (q) => q.eq("playerId", player._id).eq("day", day)).collect();
    if (prior.some((answer) => answer.questionKey === answerCommand.questionKey)) throw new Error("Answer already exists; association cannot be verified");
    await assignImpl(ctx, player._id, args.lineId, message.agentKey);
    const answerId = await ctx.runMutation(internal.game.session.submitAnswer, { playerId: player._id, questionKey: answerCommand.questionKey, text });
    await ctx.db.patch(message._id, { answerId });
    return { kind: "answer" as const, answerId };
  },
});
