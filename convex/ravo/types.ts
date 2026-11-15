import { Id } from "../_generated/dataModel";

/** What RAVO tells a caller (the chat lane, a Keiki character) to do with the current turn. */
export type RavoDirective = {
  guidance: string;
  reveal?: { clueId: Id<"clues">; text: string };
  nextQuestion?: string;
  tone?: string;
  progressDelta?: number;
  endTurn?: boolean;
};
