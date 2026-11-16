import assert from "node:assert/strict";
import test from "node:test";
import { isViewerLink, storyDestination } from "./story-navigation.ts";

test("a stored viewer opens the live case, never sample data", () => {
  assert.equal(storyDestination("viewer-A"), "/world");
  assert.equal(storyDestination("viewer-B"), "/world");
  assert.equal(storyDestination(null), "/demo");
});

test("an incoming link takes the live route even when malformed", () => {
  assert.equal(isViewerLink("viewer-B"), true);
  assert.equal(isViewerLink(""), true);
  assert.equal(isViewerLink(["a", "b"]), true);
  assert.equal(isViewerLink(undefined), false);
});
