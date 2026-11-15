import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ActionCtx, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { matchInsights } from "./scoring";
import { rolloverDue } from "../game/engine";

// RAVO's entry points. Other lanes call these (through internal.ravo.entry.*), never RAVO's internals.

async function credit(ctx: ActionCtx, groupId: Id<"groups">, keys: string[], playerId?: Id<"players">) {
  const fresh: string[] = [];
  for (const insightKey of keys) {
    if (await ctx.runMutation(internal.game.engine.recordInsight, { groupId, insightKey, playerId })) fresh.push(insightKey);
  }
  if (fresh.length > 0) await ctx.runMutation(internal.ravo.clues.unfold, { groupId });
  return fresh;
}

/** Called for every chat message (in-app or Keiki). Scores it, unfolds clues, and replies when it matters. */
export const onMessage = internalAction({
  args: { groupId: v.id("groups"), messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { groupId, messageId }) => {
    const message = await ctx.runQuery(internal.chat.messages.get, { messageId });
    if (!message || message.groupId !== groupId || message.kind !== "chat") return null;
    const { group, insights, found } = await ctx.runQuery(internal.ravo.scoring.context, { groupId });
    if (group.status !== "active") return null;
    const hits = matchInsights(insights, message.body).filter((k) => !found.includes(k));
    const fresh = await credit(ctx, groupId, hits, message.playerId);
    const addressed = /\bravo\b/i.test(message.body);
    if (fresh.length === 0 && !addressed) return null;
    const label = insights.find((i: { key: string }) => i.key === fresh[0])?.label;
    const fallback = label ? `Sharp. ${label}. The fog just got thinner.` : "I'm listening, detective. Bring me evidence, not feelings.";
    const { text } = await ctx.runAction(internal.ravo.llm.complete, {
      groupId,
      prompt: `A detective wrote in the team chat: "${message.body}". ${label ? `It establishes: ${label}.` : "It asks you something."} Reply in one or two lines.`,
      fallback,
    });
    await ctx.runMutation(internal.chat.messages.postRavoMessage, { groupId, kind: "ravo", body: text, playerId: message.playerId });
    return null;
  },
});

/** Called after a player submits a session answer. Judges it, records deductions, unfolds clues. */
export const onAnswer = internalAction({
  args: { answerId: v.id("answers") },
  returns: v.null(),
  handler: async (ctx, { answerId }) => {
    const data = await ctx.runQuery(internal.ravo.scoring.answerContext, { answerId });
    if (!data?.question) return null;
    const { answer, player, question } = data;
    const { insights } = await ctx.runQuery(internal.ravo.scoring.context, { groupId: answer.groupId });
    const hits = matchInsights(insights, answer.text).filter((k) => question.insightKeys.includes(k));
    const fresh = await credit(ctx, answer.groupId, hits, answer.playerId);
    const fallback = hits.length > 0 ? `That's it, Detective ${player.name}. Keep pulling that thread.` : `Not quite, Detective ${player.name}. The answer is in the evidence.`;
    const { text } = await ctx.runAction(internal.ravo.llm.complete, {
      groupId: answer.groupId,
      prompt: `Question: ${question.prompt}\nSecret reference answer: ${question.reference}\nDetective ${player.name} answered: "${answer.text}"\nReact in one or two lines without revealing anything they didn't get.`,
      fallback,
    });
    await ctx.runMutation(internal.ravo.scoring.saveVerdict, { answerId, score: hits.length > 0 ? 1 : 0, verdict: text });
    if (fresh.length > 0) await ctx.runMutation(internal.chat.messages.postRavoMessage, { groupId: answer.groupId, kind: "ravo", body: text, playerId: answer.playerId });
    return null;
  },
});

export const dailyCheck = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.ravo.entry.rolloverBatch, { cursor: null });
    return null;
  },
});

export const rolloverBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("groups").withIndex("by_status", (q) => q.eq("status", "active")).paginate({ cursor, numItems: 50 });
    for (const group of page.page) await ctx.scheduler.runAfter(0, internal.ravo.entry.rolloverGroup, { groupId: group._id });
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.ravo.entry.rolloverBatch, { cursor: page.continueCursor });
    return null;
  },
});

export const rolloverGroup = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get(groupId);
    if (group?.status === "active") {
      const more = await rolloverDue(ctx, group);
      if (more) await ctx.scheduler.runAfter(0, internal.ravo.entry.rolloverGroup, { groupId });
      else await ctx.scheduler.runAfter(0, internal.ravo.pace.checkLag, { groupId });
    }
    return null;
  },
});

export const player = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => await ctx.db.get(playerId),
});
