import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import schema, { alignment, characterClass, race, weapon } from './schema';

export const list = query({
  args: {},
  returns: v.array(schema.doc('characters')),
  handler: async (ctx) => {
    return await ctx.db.query('characters').order('desc').take(50);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    characterClass,
    race,
    alignment,
    weapon,
    backstory: v.string(),
  },
  returns: v.id('characters'),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error('Character name is required');
    return await ctx.db.insert('characters', { ...args, name, backstory: args.backstory.trim() });
  },
});
