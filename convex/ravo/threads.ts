import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const get = internalQuery({
  args: { groupId: v.id("groups") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { groupId }) => (await ctx.db.get(groupId))?.ravoThreadId ?? null,
});

export const set = internalMutation({
  args: { groupId: v.id("groups"), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { groupId, threadId }) => {
    await ctx.db.patch(groupId, { ravoThreadId: threadId });
    return null;
  },
});
