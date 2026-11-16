import { makeFunctionReference } from "convex/server";
import { Infer, v } from "convex/values";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { internalMutation } from "../../_generated/server";
import { assignImpl, COMMON_CHARACTER } from "../../ravo/casts";
import { ROLES, SURVEY } from "../catalog";
import { projectedDay } from "../engine";
import { weekOf } from "../lib";
import { reviewedHintsForCase, selectReviewedHint } from "./reviewedHints";

const command = v.union(
  v.object({ kind: v.literal("survey"), answers: v.array(v.object({ questionKey: v.string(), optionIndex: v.number() })) }),
  v.object({ kind: v.literal("answer"), questionKey: v.string(), text: v.string() }),
  v.object({ kind: v.literal("ability"), targetKey: v.string() }),
  v.object({ kind: v.literal("hint"), insightKey: v.string() }),
  v.object({ kind: v.literal("accusation"), suspectKey: v.string(), reasoning: v.string() }),
);

const result = v.union(
  v.object({ kind: v.literal("survey"), value: v.null() }),
  v.object({ kind: v.literal("answer"), value: v.id("answers") }),
  v.object({ kind: v.literal("ability"), value: v.string() }),
  v.object({ kind: v.literal("hint"), value: v.boolean() }),
  v.object({ kind: v.literal("accusation"), value: v.object({ correct: v.boolean() }) }),
);

const silentAccusation = makeFunctionReference<"mutation", { playerId: Id<"players">; suspectKey: string; reasoning: string }, { correct: boolean }>("game/accuse:accuseSilently");

function sameCommand(a: Infer<typeof command>, b: Infer<typeof command>) {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "survey": return b.kind === "survey" && a.answers.length === b.answers.length && a.answers.every((answer, i) => answer.questionKey === b.answers[i].questionKey && answer.optionIndex === b.answers[i].optionIndex);
    case "answer": return b.kind === "answer" && a.questionKey === b.questionKey && a.text === b.text;
    case "ability": return b.kind === "ability" && a.targetKey === b.targetKey;
    case "hint": return b.kind === "hint" && a.insightKey === b.insightKey;
    case "accusation": return b.kind === "accusation" && a.suspectKey === b.suspectKey && a.reasoning === b.reasoning;
  }
}

export const dispatch = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), messageId: v.id("messages"), lineId: v.union(v.literal("1"), v.literal("2"), v.literal("3")), caseId: v.id("cases"), day: v.number(), command },
  returns: result,
  handler: async (ctx, args): Promise<Infer<typeof result>> => {
    const group = await ctx.db.get(args.groupId);
    const player = await ctx.db.get(args.playerId);
    const message = await ctx.db.get(args.messageId);
    const kase = group && await ctx.db.get(group.caseId);
    if (!group || !kase || !player || player.groupId !== group._id || !message || message.groupId !== group._id ||
        message.playerId !== player._id || message.source !== "keiki" || message.kind !== "chat" ||
        message.lineId !== args.lineId || !message.agentKey) throw new Error("Invalid command association");
    if (message.intakeCaseId !== args.caseId || message.intakeDay !== args.day || group.caseId !== args.caseId ||
        !Number.isInteger(args.day) || projectedDay(group) !== args.day) throw new Error("Stale or missing intake context");
    if (group.status !== "lobby" && group.dayOpenedAt !== undefined && !group.gameTimeOffsetMs && projectedDay(group) === group.day && message._creationTime < group.dayOpenedAt) throw new Error("Message predates the current day");

    const receipts = await ctx.db.query("commandReceipts").withIndex("by_message", (q) => q.eq("messageId", message._id)).collect();
    if (receipts.length > 1) throw new Error("Ambiguous command receipt");
    const receipt = receipts[0];
    if (receipt) {
      if (receipt.groupId !== group._id || receipt.caseId !== group.caseId || receipt.playerId !== player._id || receipt.lineId !== args.lineId ||
          receipt.day !== args.day || !sameCommand(receipt.command, args.command) || receipt.result.kind !== receipt.command.kind) throw new Error("Conflicting command receipt");
      if (args.lineId === "1") {
        if (message.agentKey !== COMMON_CHARACTER.agentKey) throw new Error("Invalid conversation");
      } else {
        const cast = await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", player._id).eq("lineId", args.lineId)).unique();
        const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
        if (!cast || cast.groupId !== group._id || cast.agentKey !== message.agentKey || !suspects.some((suspect) => suspect.key === cast.agentKey)) throw new Error("Invalid conversation");
      }
      if (receipt.command.kind === "accusation" && receipt.result.kind === "accusation" && receipt.result.value.correct) {
        if (group.status !== "solved" || group.solvedBy !== player._id || group.solvedDay !== args.day || kase.culpritKey !== receipt.command.suspectKey) throw new Error("Stale command result");
      } else if (group.status !== "active" && !(receipt.command.kind === "survey" && group.status === "lobby")) throw new Error("Stale command result");
      if (receipt.command.kind !== "answer" && message.answerId) throw new Error("Stale command result");
      if (receipt.command.kind === "accusation" && receipt.result.kind === "accusation") {
        const suspectKey = receipt.command.suspectKey;
        const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
        if (suspects.filter((suspect) => suspect.key === suspectKey).length !== 1 || receipt.result.value.correct !== (suspectKey === kase.culpritKey)) throw new Error("Stale command result");
      }

      if (receipt.command.kind === "answer" && receipt.result.kind === "answer") {
        const answer = await ctx.db.get(receipt.result.value);
        const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", args.day)).collect();
        if (!answer || message.answerId !== answer._id || answer.groupId !== group._id || answer.playerId !== player._id || answer.day !== args.day ||
            answer.questionKey !== receipt.command.questionKey || answer.text !== receipt.command.text.trim() || !questions.some((q) => q.key === answer.questionKey)) throw new Error("Stale command result");
      }
      if (receipt.command.kind === "survey" && !player.roleKey) throw new Error("Stale command result");
      if (receipt.command.kind === "ability" && receipt.result.kind === "ability") {
        const targetKey = receipt.command.targetKey;
        const expected = receipt.result.value;
        const session = await ctx.db.query("sessions").withIndex("by_player_day", (q) => q.eq("playerId", player._id).eq("day", args.day)).first();
        if (!player.roleKey || !session || session.groupId !== group._id || session.abilityTarget !== targetKey || session.abilityResult !== expected) throw new Error("Stale command result");
        if (ROLES[player.roleKey].ability.target === "clue") {
          const unlocks = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
          const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
          if (!unlocks.some((item) => item.clueKey === targetKey) || !clues.some((item) => item.key === targetKey && item.detail === expected)) throw new Error("Stale command result");
        } else {
          const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
          const suspect = suspects.find((item) => item.key === targetKey);
          const value = suspect && { interrogator: suspect.interrogation, profiler: suspect.profile, archivist: suspect.records, forensic: suspect.records }[player.roleKey];
          if (value !== expected) throw new Error("Stale command result");
        }
      }
      if (receipt.command.kind === "hint" && receipt.result.kind === "hint") {
        const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
        const progress = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
        const reviewed = selectReviewedHint(kase.key, receipt.command.insightKey, insights.map((item) => item.key), progress.map((item) => item.insightKey), reviewedHintsForCase(kase.key));
        const hints = await ctx.db.query("hints").withIndex("by_group_week", (q) => q.eq("groupId", group._id).eq("week", weekOf(args.day))).collect();
        if (!reviewed || (receipt.result.value && !hints.some((hint) => hint.playerId === player._id && hint.day === args.day && hint.insightKey === reviewed.insightKey && hint.body === reviewed.body))) throw new Error("Stale command result");
      }
      return receipt.result;
    }

    if (group.status !== "active" && !(args.command.kind === "survey" && group.status === "lobby")) throw new Error("The case isn't open");
    if (message.answerId || await ctx.db.query("storyEvents").withIndex("by_message", (q) => q.eq("messageId", message._id)).first()) throw new Error("Message already associated");
    await assignImpl(ctx, player._id, args.lineId, message.agentKey);
    let value: Infer<typeof result>;
    switch (args.command.kind) {
      case "survey": {
        const answers = args.command.answers;
        if (answers.length !== SURVEY.length || new Set(answers.map((answer) => answer.questionKey)).size !== SURVEY.length || answers.some((answer) => {
          const question = SURVEY.find((item) => item.id === answer.questionKey);
          return !question || !Number.isInteger(answer.optionIndex) || answer.optionIndex < 0 || answer.optionIndex >= question.options.length;
        })) throw new Error("Invalid survey answers");
        if (player.roleKey || (await ctx.db.query("surveyAnswers").withIndex("by_player", (q) => q.eq("playerId", player._id)).first())) throw new Error("Survey already completed or started");
        await ctx.runMutation(internal.game.survey.submit, { playerId: player._id, answers });
        value = { kind: "survey", value: null };
        break;
      }
      case "answer": {
        if (!args.command.text.trim()) throw new Error("Answer must not be empty");
        const questionKey = args.command.questionKey;
        const prior = await ctx.db.query("answers").withIndex("by_player_day", (q) => q.eq("playerId", player._id).eq("day", args.day)).collect();
        if (prior.some((answer) => answer.questionKey === questionKey)) throw new Error("Answer already exists; association cannot be verified");
        const answerId = await ctx.runMutation(internal.game.session.submitAnswer, { playerId: player._id, questionKey, text: args.command.text.trim() });
        await ctx.db.patch(message._id, { answerId });
        value = { kind: "answer", value: answerId };
        break;
      }
      case "ability":
        value = { kind: "ability", value: await ctx.runMutation(internal.game.session.useAbility, { playerId: player._id, targetKey: args.command.targetKey }) };
        break;
      case "hint": {
        const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
        const progress = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
        const reviewed = selectReviewedHint(kase.key, args.command.insightKey, insights.map((item) => item.key), progress.map((item) => item.insightKey), reviewedHintsForCase(kase.key));
        if (!reviewed) throw new Error("No eligible reviewed hint");
        value = { kind: "hint", value: await ctx.runMutation(internal.game.engine.giveHint, { groupId: group._id, playerId: player._id, insightKey: reviewed.insightKey, body: reviewed.body }) };
        break;
      }
      case "accusation": {
        const suspectKey = args.command.suspectKey;
        const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
        if (suspects.filter((suspect) => suspect.key === suspectKey).length !== 1 || !args.command.reasoning.trim()) throw new Error("Invalid accusation");
        const answers = await ctx.db.query("answers").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
        if (answers.some((answer) => answer.score === undefined)) throw new Error("Answers are still awaiting scoring");
        value = { kind: "accusation", value: await ctx.runMutation(silentAccusation, { playerId: player._id, suspectKey, reasoning: args.command.reasoning }) };
        break;
      }
    }
    await ctx.db.insert("commandReceipts", { groupId: group._id, caseId: group.caseId, playerId: player._id, messageId: message._id, lineId: args.lineId, day: args.day, command: args.command, result: value });
    return value;
  },
});
