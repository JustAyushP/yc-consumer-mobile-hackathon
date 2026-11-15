import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import schema from './schema';

export const list = query({
  args: {},
  returns: v.array(schema.doc('messages')),
  handler: async (ctx) => {
    return await ctx.db.query('messages').order('desc').take(50);
  },
});

export const send = mutation({
  args: { body: v.string() },
  returns: v.id('messages'),
  handler: async (ctx, { body }) => {
    const trimmed = body.trim();
    if (!trimmed) throw new Error('Message body is empty');
    return await ctx.db.insert('messages', { body: trimmed });
  },
});
