export type ReviewedHint = { caseKey: string; insightKey: string; body: string };

const reviewedHints: readonly ReviewedHint[] = [];

export function reviewedHintsForCase(caseKey: string): readonly ReviewedHint[] {
  return reviewedHints.filter((hint) => hint.caseKey === caseKey);
}

export function selectReviewedHint(caseKey: string, insightKey: string, available: readonly string[], credited: readonly string[], hints: readonly ReviewedHint[]): ReviewedHint | null {
  if (!available.includes(insightKey) || credited.includes(insightKey)) return null;
  const matches = hints.filter((hint) => hint.caseKey === caseKey && hint.insightKey === insightKey && hint.body.trim());
  return matches.length === 1 ? matches[0] : null;
}
