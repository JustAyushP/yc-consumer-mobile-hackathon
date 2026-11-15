import assert from "node:assert/strict";
import test from "node:test";
import { planCast } from "./casting.ts";
import { buildCharacterContext, buildCrossPlayerContext, buildScriptedDirective } from "./context.ts";
import { planSharedEffects, planStoryTransition, selectEligibleBeat } from "./story.ts";

const snapshot = {
  day: 2, act: 1, version: 3, doneBeats: [], flags: {},
  creditedInsights: ["i_poison"], unlockedClues: ["e_glass"],
  fixedSolution: { culpritKey: "s_margot" },
};
const beats = [
  { key: "fixture-a", act: 2, minDay: 2, requiredInsights: ["i_poison"], requiredClues: ["e_glass"], effects: [{ kind: "flag", key: "fixture-choice", value: true }] },
  { key: "fixture-b", act: 3, minDay: 3, forceAtDay: 2, requiredClues: ["e_locked"], effects: [] },
];
const characters = [
  { agentKey: "s_vivian", name: "Vivian Cross" },
  { agentKey: "s_leo", name: "Leo Marlowe" },
];
const commonCharacter = { agentKey: "common", name: "Sal, the night bartender" };
const castInput = {
  role: "forensic", roleOrdinal: 0, commonCharacter, characters,
  castPlan: { forensic: { "2": ["s_vivian", "s_leo"], "3": ["s_leo", "s_vivian"] } },
};
const context = {
  recipientId: "p1", character: characters[0], publicIdentity: "Fixture identity.", publicVoice: "Fixture voice.",
  facts: [
    { text: "p1 testimony", audience: "player", playerId: "p1", unlocked: true },
    { text: "p2 testimony", audience: "player", playerId: "p2", unlocked: true },
    { text: "locked secret", audience: "group", unlocked: false },
    { text: "shared fact", audience: "group", unlocked: true },
  ],
};
const publicTeamCatalog = {
  playerNames: { p1: "One", p2: "Two" }, characterNames: { s_vivian: "Vivian Cross" },
  creditedInsightLabels: { i_poison: "a public deduction" }, decisionLabels: { d1: "a public choice" },
};
const teamEvents = [
  { kind: "talkedTo", playerId: "p2", characterKey: "s_vivian", privateResult: "never include" },
  { kind: "creditedInsight", insightKey: "i_poison", testimony: "never include either" },
  { kind: "decision", decisionKey: "d1" },
];

test("deterministic story transition and shared effects preserve the fixed solution", () => {
  const original = structuredClone(snapshot);
  const casts = [{ playerId: "p2", lineId: "2", agentKey: "s_vivian" }, { playerId: "p1", lineId: "2", agentKey: "s_vivian" }];
  const transition = planStoryTransition(snapshot, beats, "fixture-a", ["p2", "p1"], casts);
  assert.deepEqual(transition, planStoryTransition(snapshot, beats, "fixture-a", ["p2", "p1"], casts));
  assert.deepEqual(snapshot, original);
  assert.equal(JSON.stringify(transition).includes("s_margot"), false);
  const effects = planSharedEffects([{ kind: "trust", agentKey: "s_vivian", delta: -1 }, { kind: "cast", lineId: "3", agentKey: "s_leo" }], ["p2", "p1", "p1"], casts);
  assert.deepEqual(effects.map((effect) => effect.playerId), ["p1", "p2", "p1", "p2"]);
  assert.equal(effects.some((effect) => "culpritKey" in effect), false);
  assert.deepEqual(planSharedEffects([{ kind: "flag", key: "fixture", value: true, culpritKey: "s_margot" }], [], []), [{ kind: "flag", key: "fixture", value: true }]);
  assert.throws(() => planSharedEffects([{ kind: "solution", culpritKey: "other" }], [], []), /Unsupported/);
});

test("unavailable and already completed beats cannot be forced past prerequisites", () => {
  assert.equal(selectEligibleBeat({ ...snapshot, doneBeats: ["fixture-a"] }, beats), undefined);
  assert.throws(() => planStoryTransition(snapshot, beats, "fixture-b", [], []), /not the next eligible/);
  assert.equal(selectEligibleBeat({ ...snapshot, day: 1, creditedInsights: [] }, beats), undefined);
  assert.equal(selectEligibleBeat({ ...snapshot, doneBeats: ["fixture-a"], unlockedClues: ["e_locked"] }, beats)?.key, "fixture-b");
});

test("casting is deterministic, role matched, and common on line one", () => {
  assert.deepEqual(planCast({ ...castInput, lineId: "1" }), commonCharacter);
  assert.deepEqual(planCast({ ...castInput, lineId: "2" }), characters[0]);
  assert.deepEqual(planCast({ ...castInput, lineId: "2", roleOrdinal: 1 }), characters[1]);
  assert.deepEqual(planCast({ ...castInput, lineId: "3" }), characters[1]);
  assert.equal(planCast({ ...castInput, lineId: "2", role: "profiler" }), undefined);
});

test("context includes only authorized recipient facts and never locked facts", () => {
  const first = buildCharacterContext(context);
  const second = buildCharacterContext({ ...context, recipientId: "p2" });
  assert.match(first, /p1 testimony/);
  assert.doesNotMatch(first, /p2 testimony|locked secret/);
  assert.match(second, /p2 testimony/);
  assert.doesNotMatch(second, /p1 testimony|locked secret/);
  assert.match(first, /shared fact/);
});

test("fallback is stable, allowlisted, and never includes crossPlayer on private lines", () => {
  const input = { lineId: "1", context, publicTeamCatalog, teamEvents };
  const first = buildScriptedDirective(input);
  assert.deepEqual(first, buildScriptedDirective(input));
  assert.equal(first.crossPlayer, "Two spoke with Vivian Cross. The team established: a public deduction.");
  assert.doesNotMatch(JSON.stringify(first), /never include|p2 testimony|locked secret/);
  for (const lineId of ["2", "3"]) {
    assert.equal(buildCrossPlayerContext(lineId, "p1", teamEvents, publicTeamCatalog), undefined);
    assert.equal("crossPlayer" in buildScriptedDirective({ ...input, lineId }), false);
  }
  assert.equal(buildCrossPlayerContext("1", "p1", [{ kind: "creditedInsight", insightKey: "not-allowlisted" }], publicTeamCatalog), undefined);
  assert.equal(buildCrossPlayerContext("1", "p1", [{ kind: "abilityUsed", decisionKey: "d1", result: "private result" }], publicTeamCatalog), undefined);
  assert.equal(buildCrossPlayerContext("1", "p1", [{ kind: "creditedInsight", insightKey: "toString" }], publicTeamCatalog), undefined);
});
