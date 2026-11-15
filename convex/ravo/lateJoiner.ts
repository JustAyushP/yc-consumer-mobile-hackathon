import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

/** Writes a late joiner into the storyline with a short intro in the group chat. */
export const writeIn = internalAction({
  args: { playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const p = await ctx.runQuery(internal.ravo.entry.player, { playerId });
    if (!p?.roleKey) return null;
    const fallback = `The door opens and the rain comes in with a new face: Detective ${p.name}, ${p.roleKey}, borrowed from the 4th Precinct. Catch them up, team.`;
    const { text } = await ctx.runAction(internal.ravo.llm.complete, {
      groupId: p.groupId,
      prompt: `A detective named ${p.name} joins the case late as the team's ${p.roleKey}. Write a three-sentence noir intro that writes them into the story and tells the team to catch them up.`,
      fallback,
    });
    await ctx.runMutation(internal.game.engine.addNarration, { groupId: p.groupId, kind: "intro", body: text });
    return null;
  },
});
