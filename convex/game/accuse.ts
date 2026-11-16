import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { internalMutation, MutationCtx } from "../_generated/server";
import { loadPlayer } from "./lib";
import { currentGroup } from "./engine";
import { consumeDailyTurn } from "./integration/daily";
import { SF_CONTENT_REVISION } from "../cases/sfCandidate";
import { isSfBound, verifiedSfGroup } from "./integration/sf";

async function applyAccusation(ctx: MutationCtx, { playerId, suspectKey, reasoning }: { playerId: Id<"players">; suspectKey: string; reasoning: string }, emitChat: boolean) {
  const { player, group: loadedGroup } = await loadPlayer(ctx, playerId);
  if (loadedGroup.status !== "active") throw new Error("The case isn't open");
  const kase = (await ctx.db.get(loadedGroup.caseId))!;
  if (kase.contentRevision === SF_CONTENT_REVISION || await isSfBound(ctx, loadedGroup._id, loadedGroup.caseId)) {
    const segments = await ctx.db.query("brainSegments").withIndex("by_group", (q) => q.eq("groupId", loadedGroup._id)).unique();
    if (!segments || segments.index !== 7 || !segments.completed || !segments.definitions[6]?.accusationEligible || !await verifiedSfGroup(ctx, loadedGroup._id, loadedGroup.caseId)) throw new Error("Accusation is not available yet");
  }
  const group = await currentGroup(ctx, loadedGroup);
  const answers = await ctx.db.query("answers").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  if (answers.some((answer) => answer.score === undefined)) throw new Error("Answers are still awaiting scoring");
  await consumeDailyTurn(ctx, group, playerId);
  if (emitChat) {
    await ctx.scheduler.runAfter(0, internal.chat.messages.postRavoMessage, {
      groupId: group._id,
      kind: "accusation",
      body: `Detective ${player.name} accuses ${suspectKey}: "${reasoning.trim()}"`,
      playerId,
      meta: suspectKey,
    });
  }
  const correct = suspectKey === kase.culpritKey;
  if (!correct) {
    await ctx.db.patch(group._id, { wrongAccusations: group.wrongAccusations + 1 });
    return { correct };
  }
  await ctx.db.patch(group._id, { status: "solved", solvedBy: playerId, solvedDay: group.day });
  await ctx.db.insert("narration", { groupId: group._id, kind: "reveal", body: kase.reveal.join("\n\n") });
  return { correct };
}

export const accuse = internalMutation({
  args: { playerId: v.id("players"), suspectKey: v.string(), reasoning: v.string() },
  returns: v.object({ correct: v.boolean() }),
  handler: async (ctx, args) => await applyAccusation(ctx, args, true),
});

export const accuseSilently = internalMutation({
  args: { playerId: v.id("players"), suspectKey: v.string(), reasoning: v.string() },
  returns: v.object({ correct: v.boolean() }),
  handler: async (ctx, args) => await applyAccusation(ctx, args, false),
});
