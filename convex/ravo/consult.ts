import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { COMMON_LINE } from "./casts";
import { matchInsights } from "./scoring";
import { RavoDirective } from "./types";

export const vRavoDirective = v.object({
  character: v.object({ agentKey: v.string(), name: v.string() }),
  guidance: v.string(),
  reveal: v.optional(v.object({ clueId: v.id("clues"), text: v.string() })),
  nextQuestion: v.optional(v.string()),
  tone: v.optional(v.string()),
  progressDelta: v.optional(v.number()),
  endTurn: v.optional(v.boolean()),
  crossPlayer: v.optional(v.string()),
});

export const clueByKey = internalQuery({
  args: { groupId: v.id("groups"), clueKey: v.string() },
  handler: async (ctx, { groupId, clueKey }) => {
    const group = (await ctx.db.get(groupId))!;
    return await ctx.db
      .query("clues")
      .withIndex("by_case", (q) => q.eq("caseId", group.caseId))
      .filter((q) => q.eq(q.field("key"), clueKey))
      .first();
  },
});

/**
 * Asks RAVO how to handle one message. Deterministic stub: records any deduction the message makes,
 * unfolds clues through the engine (game.engine.unlockClue via ravo.clues.unfold), and reveals the first newly unlocked one.
 * crossPlayer only carries deductions the whole team has already made, so it never leaks a clue another player must earn.
 */
export const consult = internalAction({
  args: {
    groupId: v.id("groups"),
    playerId: v.optional(v.id("players")),
    messageId: v.id("messages"),
    lineId: v.string(),
    agentKey: v.optional(v.string()),
  },
  returns: vRavoDirective,
  handler: async (ctx, { groupId, playerId, messageId, lineId }): Promise<RavoDirective> => {
    const message = await ctx.runQuery(internal.chat.messages.get, { messageId });
    const who = playerId ?? message?.playerId;
    const character = who ? await ctx.runMutation(internal.ravo.casts.assign, { playerId: who, lineId }) : { agentKey: "common", name: "Sal, the night bartender" };
    const { group, insights, found } = await ctx.runQuery(internal.ravo.scoring.context, { groupId });
    if (!message || group.status !== "active") return { character, guidance: "The case isn't open. Stay in character and wait.", endTurn: true };
    const before = group.progress;
    let opened: string[] = [];
    for (const insightKey of matchInsights(insights, message.body).filter((k) => !found.includes(k))) {
      await ctx.runMutation(internal.game.engine.recordInsight, { groupId, insightKey, playerId: who });
    }
    opened = await ctx.runMutation(internal.ravo.clues.unfold, { groupId });
    const now = await ctx.runQuery(internal.ravo.scoring.context, { groupId });
    const after = now.group.progress;
    const teamDeductions = now.insights.filter((i) => now.found.includes(i.key)).map((i) => i.label);
    const clue = opened.length > 0 ? await ctx.runQuery(internal.ravo.consult.clueByKey, { groupId, clueKey: opened[0] }) : null;
    return {
      character,
      ...(lineId === COMMON_LINE && teamDeductions.length > 0 ? { crossPlayer: `The team has established: ${teamDeductions.join("; ")}.` } : {}),
      guidance: clue ? "The detective made a real deduction. Acknowledge it and hand over the new evidence." : "Stay in character. Nudge the detective back to the evidence without giving anything away.",
      ...(clue ? { reveal: { clueId: clue._id, text: `${clue.name}: ${clue.summary}` } } : {}),
      tone: "noir",
      progressDelta: after - before,
      endTurn: false,
    };
  },
});
