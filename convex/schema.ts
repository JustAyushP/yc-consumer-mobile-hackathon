import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const characterClass = v.union(
  v.literal('warrior'),
  v.literal('mage'),
  v.literal('rogue'),
  v.literal('cleric'),
  v.literal('ranger'),
);

export const race = v.union(
  v.literal('human'),
  v.literal('elf'),
  v.literal('dwarf'),
  v.literal('halfling'),
  v.literal('orc'),
);

export const alignment = v.union(v.literal('good'), v.literal('neutral'), v.literal('evil'));

export const weapon = v.union(
  v.literal('sword'),
  v.literal('staff'),
  v.literal('dagger'),
  v.literal('mace'),
  v.literal('bow'),
);

export default defineSchema({
  characters: defineTable({
    name: v.string(),
    characterClass,
    race,
    alignment,
    weapon,
    backstory: v.string(),
  }),
});
