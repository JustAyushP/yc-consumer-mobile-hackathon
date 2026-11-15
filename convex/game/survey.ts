import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import { SURVEY } from "./catalog";
import { loadPlayer } from "./lib";

export const questions = query({
  args: {},
  handler: async () => SURVEY.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options.map((o) => o.label) })),
});

/** Saves the player's answers (option index per survey question) and assigns their role. */
export const submit = mutation({
  args: { playerId: v.id("players"), answers: v.array(v.object({ questionKey: v.string(), optionIndex: v.number() })) },
  returns: v.null(),
  handler: async (ctx, { playerId, answers }) => {
    const { player, group } = await loadPlayer(ctx, playerId);
    if (player.roleKey) return null;
    if (answers.length !== SURVEY.length) throw new Error("Answer every question");
    for (const a of answers) await ctx.db.insert("surveyAnswers", { groupId: group._id, playerId, ...a });
    await ctx.runMutation(internal.game.roles.assign, { playerId });
    return null;
  },
});
