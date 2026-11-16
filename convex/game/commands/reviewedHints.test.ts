import { expect, it } from "vitest";
import { reviewedHintsForCase, selectReviewedHint } from "./reviewedHints";

it("selects exactly one reviewed, uncredited case insight and fails closed otherwise", () => {
  const hint = { caseKey: "fixture", insightKey: "insight", body: "Reviewed fixture hint" };
  expect(reviewedHintsForCase("fixture")).toEqual([]);
  expect(selectReviewedHint("fixture", "insight", ["insight"], [], [hint])).toEqual(hint);
  expect(selectReviewedHint("other", "insight", ["insight"], [], [hint])).toBeNull();
  expect(selectReviewedHint("fixture", "unknown", ["insight"], [], [hint])).toBeNull();
  expect(selectReviewedHint("fixture", "insight", [], [], [hint])).toBeNull();
  expect(selectReviewedHint("fixture", "insight", ["insight"], ["insight"], [hint])).toBeNull();
  expect(selectReviewedHint("fixture", "insight", ["insight"], [], [])).toBeNull();
  expect(selectReviewedHint("fixture", "insight", ["insight"], [], [hint, hint])).toBeNull();
  expect(selectReviewedHint("fixture", "insight", ["insight"], [], [{ ...hint, body: " " }])).toBeNull();
});
