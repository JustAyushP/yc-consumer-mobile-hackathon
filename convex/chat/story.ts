import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { currentGroup, openDayImpl, unlockClueImpl } from "../game/engine";

// Chat-side story support: each character's knowledge sheet, the judge's candidate deductions, crediting through the engine, and the turn clock.

async function unlockedClues(ctx: QueryCtx, group: Doc<"groups">) {
  const [unlocks, clues] = await Promise.all([
    ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect(),
  ]);
  return clues.filter((clue) => unlocks.some((unlock) => unlock.clueKey === clue.key));
}

export async function knowledgeSheet(ctx: QueryCtx, group: Doc<"groups">, agentKey: string) {
  const kase = await ctx.db.get(group.caseId);
  const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
  const evidence = await unlockedClues(ctx, group);
  const me = suspects.find((s) => s.key === agentKey);
  const lines = [
    `Knowledge sheet for ${me?.name ?? "Sal, the night bartender"} (share it in character when the detective asks well; do not recite it all at once):`,
    `The case: ${kase?.title}. ${kase?.setting}. Victim: ${kase?.victim}. ${kase?.logline}`,
    `People in the lounge that night: ${suspects.map((s) => `${s.name} (${s.title})`).join("; ")}.`,
  ];
  if (me) {
    lines.push(`Who you are: ${me.bio}`, `Your own account of the night (what you tell the detective, in your words): ${me.interrogation}`,
      `How you come across / what you are guarding (play it, do not state it): ${me.profile}`, `What the records say about you (you may confirm or bristle at these): ${me.records}`);
  } else {
    lines.push("Who you are: Sal, the night bartender. You served drinks all night, saw who came and went, and hear every rumor in the lounge. You did not see the murder.",
      ...suspects.map((s) => `What you know of ${s.name}: ${s.bio}`));
  }
  if (evidence.length) lines.push("Evidence now on the table (everyone in the lounge has heard about it; discuss it, connect it, point the detective at it):", ...evidence.map((clue) => `- ${clue.name}: ${clue.summary} ${clue.detail}`));
  return lines.join("\n");
}

/** Shared cross-line memory and this character's knowledge sheet, appended to every directive. */
export const characterContext = internalQuery({
  args: { playerId: v.id("players"), messageId: v.id("messages"), agentKey: v.string() },
  returns: v.string(),
  handler: async (ctx, { playerId, messageId, agentKey }): Promise<string> => {
    const player = await ctx.db.get(playerId);
    const group = player && await ctx.db.get(player.groupId);
    if (!group) return "";
    const memory: string = await ctx.runQuery(internal.chat.messages.sharedMemory, { playerId, messageId });
    return [await knowledgeSheet(ctx, group, agentKey), memory].filter(Boolean).join("\n\n");
  },
});

async function candidates(ctx: QueryCtx, group: Doc<"groups">) {
  const [insights, questions, progress] = await Promise.all([
    ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect(),
    ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId)).collect(),
    ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
  ]);
  return insights.filter((insight) => !progress.some((p) => p.insightKey === insight.key)).flatMap((insight) => {
    const question = questions.find((q) => q.day <= group.day && q.insightKeys.includes(insight.key));
    return question ? [{ insightKey: insight.key, label: insight.label, question: question.prompt, reference: question.reference, keywords: insight.keywords }] : [];
  });
}

export const judgeContext = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message?.playerId || message.kind !== "chat" || message.source !== "keiki") return null;
    const group = await ctx.db.get(message.groupId);
    if (!group || group.status !== "active") return null;
    const recent = (await ctx.db.query("messages").withIndex("by_player_agent", (q) => q.eq("playerId", message.playerId!)).collect())
      .filter((m) => m.kind === "chat" && m.source === "keiki" && m._id !== messageId).sort((a, b) => a._creationTime - b._creationTime).slice(-6).map((m) => m.body);
    return { body: message.body, recent, candidates: await candidates(ctx, group) };
  },
});

async function notice(ctx: MutationCtx, message: Doc<"messages">, body: string) {
  await ctx.db.insert("messages", { groupId: message.groupId, playerId: message.playerId, kind: "notice", source: "ravo", body, lineId: message.lineId });
}

/** Credit a judged deduction through the engine. Anything not currently creditable is a no-op. */
export const credit = internalMutation({
  args: { messageId: v.id("messages"), insightKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { messageId, insightKey }) => {
    const message = await ctx.db.get(messageId);
    const loaded = message && await ctx.db.get(message.groupId);
    if (!message?.playerId || !loaded || loaded.status !== "active") return false;
    const group = await currentGroup(ctx, loaded);
    const candidate = (await candidates(ctx, group)).find((c) => c.insightKey === insightKey);
    if (!candidate) return false;
    const credited: boolean = await ctx.runMutation(internal.game.engine.recordInsight, { groupId: group._id, insightKey, playerId: message.playerId });
    if (!credited) return false;
    await notice(ctx, message, `Deduction confirmed: ${candidate.label}.`);
    const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    for (const clue of clues) {
      if ("insight" in clue.unlock && clue.unlock.insight === insightKey && await unlockClueImpl(ctx, group, clue.key)) await notice(ctx, message, `New evidence: ${clue.name}. ${clue.summary}`);
    }
    return true;
  },
});

/** Turn clock: with RAVO_TURN_CLOCK=N set, the next game day (and its clues) opens after every N player messages in the group. */
export const tick = internalMutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const every = Number(process.env.RAVO_TURN_CLOCK);
    const message = await ctx.db.get(messageId);
    const loaded = message && await ctx.db.get(message.groupId);
    if (!Number.isSafeInteger(every) || every < 1 || !message || !loaded || loaded.status !== "active") return null;
    const group = await currentGroup(ctx, loaded);
    const days = await ctx.db.query("days").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId)).collect();
    const turns = (await ctx.db.query("messages").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect()).filter((m) => m.kind === "chat" && m.source === "keiki").length;
    const target = Math.min(Math.max(...days.map((d) => d.day), 1), 1 + Math.floor(turns / every));
    if (group.day >= target) return null;
    const before = new Set((await unlockedClues(ctx, group)).map((clue) => clue.key));
    await openDayImpl(ctx, group, group.day + 1);
    const next = (await ctx.db.get(group._id))!;
    const info = days.find((d) => d.day === next.day);
    await notice(ctx, message, `Day ${next.day}${info ? `: ${info.title}. ${info.briefing}` : "."}`);
    for (const clue of await unlockedClues(ctx, next)) if (!before.has(clue.key)) await notice(ctx, message, `New evidence: ${clue.name}. ${clue.summary}`);
    return null;
  },
});

export type JudgeCandidate = { insightKey: string; label: string; question: string; reference: string; keywords: string[][] };
