import assert from "node:assert/strict";
import test from "node:test";
import { hasVelvetLanternScene } from "./world-content.ts";

test("the legacy and approved SF case retain their public scene", () => {
  assert.equal(hasVelvetLanternScene("Death at the Velvet Lantern"), true);
  assert.equal(hasVelvetLanternScene("Last Call on Market Street"), true);
});

test("unrelated cases do not inherit Velvet Lantern locations", () => {
  assert.equal(hasVelvetLanternScene("Another case"), false);
  assert.equal(hasVelvetLanternScene(""), false);
});
