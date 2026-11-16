import type { Beat } from "./story";

type ReviewedContent = {
  beats: readonly Beat[];
  characters: Readonly<Record<string, { publicIdentity: string; publicVoice: string; clueKeys: readonly string[] }>>;
  insightLabels: Readonly<Record<string, string>>;
};

const reviewedCases: Readonly<Record<string, ReviewedContent>> = {};

export function reviewedContentForCase(caseKey: string): ReviewedContent {
  return Object.hasOwn(reviewedCases, caseKey) ? reviewedCases[caseKey] : { beats: [], characters: {}, insightLabels: {} };
}
