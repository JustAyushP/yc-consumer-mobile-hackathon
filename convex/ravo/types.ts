import { Id } from "../_generated/dataModel";
import { v } from "convex/values";

export const vRavoDirective = v.object({
  character: v.object({ agentKey: v.string(), name: v.string() }),
  guidance: v.string(),
  reveal: v.optional(v.object({ clueId: v.id("clues"), text: v.string() })),
  nextQuestion: v.optional(v.string()),
  tone: v.optional(v.string()),
  progressDelta: v.optional(v.number()),
  endTurn: v.optional(v.boolean()),
  crossPlayer: v.optional(v.string()),
});

/** What RAVO tells a Keiki character to do with the current turn. */
export type RavoDirective = {
  /** The character to play for this player on this line. Line 1 is the common character, the same for every player. */
  character: { agentKey: string; name: string };
  guidance: string;
  reveal?: { clueId: Id<"clues">; text: string };
  nextQuestion?: string;
  tone?: string;
  progressDelta?: number;
  endTurn?: boolean;
  /** Common character only: what the rest of the team has turned up, already filtered so it never leaks a clue another player has to earn. */
  crossPlayer?: string;
};
