import { v } from "convex/values";

export const segmentGate = v.object({
  beats: v.array(v.string()), insights: v.array(v.string()), clues: v.array(v.string()), flags: v.record(v.string(), v.boolean()),
});

export const segmentDefinition = v.object({
  index: v.number(), opening: v.string(), high: v.string(), nextHook: v.optional(v.string()),
  accusationEligible: v.boolean(),
  beatKeys: v.array(v.string()), factKeys: v.array(v.string()), questionKeys: v.array(v.string()), abilityTargets: v.array(v.string()),
  entry: segmentGate, exit: segmentGate,
});
