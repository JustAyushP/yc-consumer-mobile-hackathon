import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { rolloverDue } from "../game/engine";

// RAVO's entry points. Other lanes call these (through internal.ravo.entry.*), never RAVO's internals.

export const onMessage = internalAction({
  args: { groupId: v.id("groups"), messageId: v.id("messages") },
  returns: v.null(),
  handler: async () => null,
});

/** Called after a player submits a session answer. Judges it, records deductions, unfolds clues. */
export const onAnswer = internalAction({
  args: { answerId: v.id("answers") },
  returns: v.null(),
  handler: async (ctx, { answerId }) => {
    await ctx.runMutation(internal.game.engine.processAnswer, { answerId });
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
