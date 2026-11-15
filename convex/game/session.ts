import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import { mutation, MutationCtx, query } from "../_generated/server";
import { ROLES } from "./catalog";
import { loadPlayer } from "./lib";

async function ensureSession(ctx: MutationCtx, group: Doc<"groups">, player: Doc<"players">) {
  const s = await ctx.db.query("sessions").withIndex("by_player_day", (q) => q.eq("playerId", player._id).eq("day", group.day)).first();
  if (s) return s;
  const id = await ctx.db.insert("sessions", { groupId: group._id, playerId: player._id, day: group.day, completed: false });
  return (await ctx.db.get(id))!;
}

/** Today's session for one player: briefing, questions with their answers, ability state. */
export const today = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const { player, group } = await loadPlayer(ctx, playerId);
    const day = await ctx.db.query("days").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", group.day)).first();
    const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", group.day)).collect();
    const answers = await ctx.db.query("answers").withIndex("by_player_day", (q) => q.eq("playerId", playerId).eq("day", group.day)).collect();
    const session = await ctx.db.query("sessions").withIndex("by_player_day", (q) => q.eq("playerId", playerId).eq("day", group.day)).first();
    return {
      day: group.day,
      title: day?.title ?? null,
      briefing: day?.briefing ?? null,
      questions: questions.map((q) => ({ key: q.key, prompt: q.prompt, answer: answers.find((a) => a.questionKey === q.key) ?? null })),
      ability: player.roleKey ? ROLES[player.roleKey].ability : null,
      abilityUsed: session?.abilityResult ? { target: session.abilityTarget!, result: session.abilityResult } : null,
      completed: session?.completed ?? false,
    };
  },
});

export const submitAnswer = mutation({
  args: { playerId: v.id("players"), questionKey: v.string(), text: v.string() },
  returns: v.id("answers"),
  handler: async (ctx, { playerId, questionKey, text }) => {
    const { player, group } = await loadPlayer(ctx, playerId);
    if (group.status !== "active") throw new Error("The case isn't open");
    const prior = (await ctx.db.query("answers").withIndex("by_player_day", (q) => q.eq("playerId", playerId).eq("day", group.day)).collect()).find(
      (a) => a.questionKey === questionKey,
    );
    if (prior) return prior._id;
    await ensureSession(ctx, group, player);
    const answerId = await ctx.db.insert("answers", { groupId: group._id, playerId, day: group.day, questionKey, text: text.trim() });
    await ctx.scheduler.runAfter(0, internal.ravo.entry.onAnswer, { answerId });
    return answerId;
  },
});

/** The role's once-per-day special ability, on a clue key or a suspect key. */
export const useAbility = mutation({
  args: { playerId: v.id("players"), targetKey: v.string() },
  returns: v.string(),
  handler: async (ctx, { playerId, targetKey }) => {
    const { player, group } = await loadPlayer(ctx, playerId);
    if (group.status !== "active" || !player.roleKey) throw new Error("Not now, detective");
    const session = await ensureSession(ctx, group, player);
    if (session.abilityResult) throw new Error("Ability already used today");
    let result: string | undefined;
    if (ROLES[player.roleKey].ability.target === "clue") {
      result = (await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect()).find((c) => c.key === targetKey)?.detail;
    } else {
      const s = (await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect()).find((x) => x.key === targetKey);
      result = s && { interrogator: s.interrogation, profiler: s.profile, archivist: s.records, forensic: s.records }[player.roleKey];
    }
    if (!result) throw new Error("Nothing to find there");
    await ctx.db.patch(session._id, { abilityTarget: targetKey, abilityResult: result });
    return result;
  },
});

export const complete = mutation({
  args: { playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const { player, group } = await loadPlayer(ctx, playerId);
    if (group.status !== "active") return null;
    const session = await ensureSession(ctx, group, player);
    await ctx.db.patch(session._id, { completed: true });
    await ctx.scheduler.runAfter(0, internal.ravo.pace.checkLag, { groupId: group._id });
    return null;
  },
});
