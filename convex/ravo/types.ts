import { Id } from "../_generated/dataModel";

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
