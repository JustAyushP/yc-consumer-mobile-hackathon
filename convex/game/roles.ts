import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { vRoleKey } from "../schema";
import { CORE_ROLES, ROLES, RoleKey, SURVEY } from "./catalog";
import { groupPlayers, loadPlayer } from "./lib";

export const list = internalQuery({
  args: {},
  handler: async () => Object.values(ROLES),
});

/** Picks the best role for the survey answers, preferring core roles nobody holds yet. */
export const assign = internalMutation({
  args: { playerId: v.id("players") },
  returns: vRoleKey,
  handler: async (ctx, { playerId }) => {
    const { player, group } = await loadPlayer(ctx, playerId);
    if (player.roleKey) return player.roleKey;
    const answers = await ctx.db.query("surveyAnswers").withIndex("by_player", (q) => q.eq("playerId", playerId)).collect();
    const scores: Record<RoleKey, number> = { forensic: 0, interrogator: 0, profiler: 0, archivist: 0 };
    for (const a of answers) {
      const option = SURVEY.find((q) => q.id === a.questionKey)?.options[a.optionIndex];
      for (const [role, w] of Object.entries(option?.weights ?? {})) scores[role as RoleKey] += w ?? 0;
    }
    const taken = (await groupPlayers(ctx, group._id)).map((p) => p.roleKey).filter((r): r is RoleKey => !!r);
    const ranked = (Object.keys(scores) as RoleKey[]).sort((a, b) => scores[b] - scores[a]);
    const missingCore = CORE_ROLES.filter((r) => !taken.includes(r));
    const roleKey = missingCore.length > 0 ? (ranked.find((r) => missingCore.includes(r)) ?? missingCore[0]) : (ranked.find((r) => !taken.includes(r)) ?? ranked[0]);
    await ctx.db.patch(playerId, { roleKey });
    if (player.lateJoiner) await ctx.scheduler.runAfter(0, internal.ravo.lateJoiner.writeIn, { playerId });
    return roleKey;
  },
});
