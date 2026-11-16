import { describe, expect, it } from "vitest";
import { buildPrivateContext, planAssignment, planCatchUp, planDelivery, planTestimony, reduceRequest, validateContent, type CharacterContent, type Requirements, type Snapshot } from "./lifecycle";

const ready = { minAct: 1, minDay: 1, insights: [], clues: [], flags: {} };
const gated = { minAct: 2, minDay: 3, insights: ["insight"], clues: ["clue"], flags: { opened: true } };
const sheet = (agentKey: string, entry: Requirements = ready) => ({ agentKey, name: agentKey, publicIdentity: `${agentKey} identity`, publicVoice: `${agentKey} voice`, entry, factKeys: ["public", "private", "locked"] });
const content: CharacterContent = {
  caseKey: "fixture", revision: "fixture-v1",
  common: { ...sheet("common"), name: "Sal, the night bartender" },
  characters: [sheet("a"), sheet("b"), sheet("c"), sheet("d", gated)],
  castPlan: {
    forensic: { "2": ["a", "d"], "3": ["b"] },
    interrogator: { "2": ["b"], "3": ["c"] },
    profiler: { "2": ["c"], "3": ["a"] },
  },
  facts: [
    { key: "public", text: "public fact", audience: "group", requirements: ready },
    { key: "private", text: "private testimony", audience: "player", requirements: ready },
    { key: "locked", text: "locked clue", audience: "group", clueKey: "clue", requirements: ready },
  ],
};
const initial = (): Snapshot => ({
  caseKey: "fixture", contentRevision: "fixture-v1", story: { day: 1, act: 1, version: 0, doneBeats: [], flags: {}, creditedInsights: [], unlockedClues: [] },
  players: [{ id: "p1", role: "forensic", roleOrdinal: 0 }, { id: "p2", role: "interrogator", roleOrdinal: 0 }, { id: "p3", role: "profiler", roleOrdinal: 0 }],
  assignments: [], deliveries: [], entitledFacts: { p1: ["public", "private", "locked"], p2: ["public"], p3: [] },
});

describe("character lifecycle", () => {
  it("plans three role-specific casts while preserving Sal on line one", () => {
    const state = initial();
    expect(["p1", "p2", "p3"].map((player) => ["1", "2", "3"].map((line) => planAssignment(content, state, player, line as "1" | "2" | "3")))).toMatchObject([
      [{ agentKey: "common" }, { agentKey: "a" }, { agentKey: "b" }],
      [{ agentKey: "common" }, { agentKey: "b" }, { agentKey: "c" }],
      [{ agentKey: "common" }, { agentKey: "c" }, { agentKey: "a" }],
    ]);
    expect(() => planAssignment(content, state, "p1", "1", "a")).toThrow();
  });

  it("rejects missing coverage, dangling keys, duplicate IDs and invalid content", () => {
    expect(validateContent(content, ["archivist"])).toContain("Invalid cast coverage: archivist/2");
    expect(validateContent({ ...content, characters: [...content.characters, sheet("a")] }, ["forensic"])).toContain("Duplicate stable key");
    expect(validateContent({ ...content, castPlan: { forensic: { "2": ["missing"], "3": ["b"] } } }, ["forensic"])).toContain("Invalid cast coverage: forensic/2");
    expect(validateContent({ ...content, facts: [{ ...content.facts[0], text: "" }] }, ["forensic"]).some((error) => error.startsWith("Invalid fact"))).toBe(true);
    expect(() => planAssignment(content, { ...initial(), players: [{ id: "p4", role: "archivist", roleOrdinal: 0 }] }, "p4", "2")).toThrow(/coverage/);
  });

  it("requires act, day and prerequisites for entry and recasting", () => {
    let state = initial();
    state = reduceRequest(content, state, planAssignment(content, state, "p1", "2"));
    expect(() => planAssignment(content, state, "p1", "2", "d")).toThrow(/eligible/);
    const story = { ...state.story, day: 3, act: 2, creditedInsights: ["insight"], unlockedClues: ["clue"], flags: { opened: true } };
    const recast = planAssignment(content, { ...state, story }, "p1", "2", "d");
    expect(recast).toMatchObject({ previousAgentKey: "a", agentKey: "d" });
    expect(reduceRequest(content, { ...state, story }, recast).assignments[0].agentKey).toBe("d");
    expect(() => reduceRequest(content, state, recast)).toThrow();
    expect(() => planAssignment(content, { ...state, story }, "p1", "2", "c")).toThrow();
  });

  it("plans late join assignment first, then authorized catch-up without replaying delivered facts", () => {
    let state = initial();
    expect(planCatchUp(content, state, "p1").nextRequest).toMatchObject({ kind: "assign", lineId: "1" });
    let count = 0;
    for (;;) {
      const next = planCatchUp(content, state, "p1").nextRequest;
      if (!next) break;
      if (next.kind === "authorizeTestimony") expect(next.factKey).not.toBe("locked");
      state = reduceRequest(content, state, next);
      if (++count > 9) throw new Error("Catch-up did not settle");
    }
    expect(count).toBe(9);
    expect(planCatchUp(content, state, "p1").awaitingDelivery).toHaveLength(6);
    const delivery = planDelivery(state, "p1", "2", "a", "private", "fixture-v1", "receipt");
    expect(() => reduceRequest(content, state, delivery)).toThrow(/Unverified/);
    state = reduceRequest(content, state, delivery, "receipt");
    expect(state.deliveries.find((item) => item.lineId === "2" && item.factKey === "private")?.status).toBe("delivered");
    expect(planCatchUp(content, state, "p1").nextRequest).toBeUndefined();
    expect(planCatchUp(content, state, "p1").awaitingDelivery).toHaveLength(5);
    expect(() => planDelivery(state, "p1", "2", "a", "private", "fixture-v1", "receipt")).toThrow();
  });

  it("records an authenticated historical delivery after recast and content revision", () => {
    let state = initial();
    state = reduceRequest(content, state, planAssignment(content, state, "p1", "2"));
    state = reduceRequest(content, state, planTestimony(content, state, "p1", "2", "private"));
    const story = { ...state.story, day: 3, act: 2, creditedInsights: ["insight"], unlockedClues: ["clue"], flags: { opened: true } };
    state = reduceRequest(content, { ...state, story }, planAssignment(content, { ...state, story }, "p1", "2", "d"));
    const revised = { ...content, revision: "fixture-v2" };
    state = { ...state, contentRevision: revised.revision };
    const request = planDelivery(state, "p1", "2", "a", "private", "fixture-v1", "receipt");
    state = reduceRequest(revised, state, request, "receipt");
    expect(state.deliveries[0].status).toBe("delivered");
    expect(buildPrivateContext(revised, state, "p1", "2")).not.toContain("private testimony");
    expect(() => planDelivery(state, "p2", "2", "a", "private", "fixture-v1", "receipt")).toThrow();
  });

  it("defers gated lines and deterministically falls back to eligible cast options", () => {
    const state = initial();
    const gatedContent: CharacterContent = { ...content, castPlan: { ...content.castPlan, forensic: { "2": ["a", "d"], "3": ["d"] } } };
    const ordinalOne = { ...state, players: state.players.map((player) => player.id === "p1" ? { ...player, roleOrdinal: 1 } : player) };
    expect(planAssignment(gatedContent, ordinalOne, "p1", "2")).toMatchObject({ agentKey: "a" });
    let current: Snapshot = ordinalOne;
    for (let i = 0; i < 6; i++) {
      const next = planCatchUp(gatedContent, current, "p1").nextRequest;
      if (!next) break;
      current = reduceRequest(gatedContent, current, next);
    }
    expect(current.assignments.map((assignment) => assignment.lineId)).toEqual(["1", "2"]);
    expect(planCatchUp(gatedContent, current, "p1").nextRequest).toBeUndefined();
    const unlocked = { ...current, story: { ...current.story, day: 3, act: 2, creditedInsights: ["insight"], unlockedClues: ["clue"], flags: { opened: true } } };
    expect(planAssignment(gatedContent, unlocked, "p1", "3")).toMatchObject({ agentKey: "d" });
  });

  it("limits testimony and context to the recipient's current entitlement and cast", () => {
    let state = initial();
    for (const player of ["p1", "p2"]) state = reduceRequest(content, state, planAssignment(content, state, player, "2"));
    state = reduceRequest(content, state, planTestimony(content, state, "p1", "2", "private"));
    expect(buildPrivateContext(content, state, "p1", "2")).toContain("private testimony");
    expect(buildPrivateContext(content, state, "p2", "2")).not.toContain("private testimony");
    const extra = { ...state, privateAbilityResult: "other player's secret ability result" };
    expect(buildPrivateContext(content, extra, "p2", "2")).not.toContain(extra.privateAbilityResult);
    expect(() => planTestimony(content, state, "p2", "2", "private")).toThrow(/authorized/);
    expect(() => planTestimony(content, state, "p1", "2", "locked")).toThrow(/authorized/);
    expect(buildPrivateContext(content, { ...state, entitledFacts: { ...state.entitledFacts, p1: [] } }, "p1", "2")).not.toContain("private testimony");
    expect(buildPrivateContext({ ...content, revision: "fixture-v2" }, { ...state, contentRevision: "fixture-v2" }, "p1", "2")).not.toContain("private testimony");
    expect(() => buildPrivateContext(content, { ...state, assignments: [{ playerId: "p2", lineId: "2", agentKey: "a" }] }, "p2", "2")).toThrow(/assignment/);
  });

  it("rejects stale or altered requests without changing clue state", () => {
    const state = initial();
    const assignment = planAssignment(content, state, "p1", "2");
    const next = reduceRequest(content, state, assignment);
    expect(next.story.unlockedClues).toEqual([]);
    expect(() => reduceRequest(content, next, assignment)).toThrow(/Stale/);
    if (assignment.kind !== "assign") throw new Error("Unexpected request");
    expect(() => reduceRequest(content, state, { ...assignment, agentKey: "b" })).toThrow(/changed/);
  });
});
