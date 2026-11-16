import { v } from "convex/values";

export const effect = v.union(
  v.object({ kind: v.literal("flag"), key: v.string(), value: v.boolean() }),
  v.object({ kind: v.literal("route"), key: v.string() }),
);

export const graph = v.object({
  caseKey: v.string(),
  routes: v.array(v.object({ key: v.string(), publicLabel: v.string() })),
  beats: v.array(v.object({
    key: v.string(), act: v.number(), minDay: v.optional(v.number()), forceAtDay: v.optional(v.number()),
    requiredBeats: v.array(v.string()), requiredInsights: v.array(v.string()), requiredClues: v.array(v.string()),
    requiredFlags: v.record(v.string(), v.boolean()), effects: v.array(effect),
  })),
  decisions: v.array(v.object({
    key: v.string(), publicLabel: v.string(), requiredBeat: v.string(), durationMs: v.number(), tieOption: v.string(), defaultOption: v.string(),
    options: v.array(v.object({ key: v.string(), publicLabel: v.string(), effects: v.array(effect) })),
  })),
});
