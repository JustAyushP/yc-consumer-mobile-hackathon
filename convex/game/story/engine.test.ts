/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { Infer } from "convex/values";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../../schema";
import { settleScheduled } from "../testScheduler.support";
import { graph } from "./model";

const initialize = makeFunctionReference<"mutation">("game/story/engine:initialize");
const transition = makeFunctionReference<"mutation">("game/story/engine:transition");
const openDecision = makeFunctionReference<"mutation">("game/story/engine:openDecision");
const vote = makeFunctionReference<"mutation">("game/story/engine:vote");
const resolveDeadline = makeFunctionReference<"mutation">("game/story/engine:resolveDeadline");
const snapshot = makeFunctionReference<"query">("game/story/engine:snapshot");
const processConsult = makeFunctionReference<"mutation">("game/runtime:processConsult");
const planNext = makeFunctionReference<"mutation">("game/story/engine:planNext");

const fixtureGraph: Infer<typeof graph> = {
  caseKey: "fixture",
  beats: [
    { key: "start", act: 1, requiredBeats: [], requiredInsights: ["insight"], requiredClues: ["clue"], requiredFlags: {}, forceAtDay: 1, minDay: 5, effects: [] },
    { key: "left", act: 2, requiredBeats: ["start"], requiredInsights: [], requiredClues: [], requiredFlags: { left: true }, effects: [] },
    { key: "right", act: 2, requiredBeats: ["start"], requiredInsights: [], requiredClues: [], requiredFlags: { left: false }, effects: [] },
  ],
  decisions: [
    { key: "first", requiredBeat: "start", durationMs: 1000, tieOption: "right", defaultOption: "left", options: [
      { key: "left", effects: [{ kind: "flag" as const, key: "left", value: true }, { kind: "route" as const, key: "left-route" }] },
      { key: "right", effects: [{ kind: "flag" as const, key: "left", value: false }, { kind: "route" as const, key: "right-route" }] },
    ] },
    { key: "second", requiredBeat: "start", durationMs: 1000, tieOption: "b", defaultOption: "a", options: [
      { key: "a", effects: [{ kind: "route" as const, key: "ending-a" }] },
      { key: "b", effects: [{ kind: "route" as const, key: "ending-b" }] },
    ] },
  ],
};
let activeTest: ReturnType<typeof convexTest<typeof schema.tables>> | undefined;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  errors = vi.spyOn(console, "error");
});
afterEach(async () => {
  try {
    if (activeTest) await settleScheduled(activeTest);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    activeTest = undefined;
    errors.mockRestore();
    vi.useRealTimers();
  }
});

async function fixture(authoredGraph = fixtureGraph) {
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  activeTest = t;
  const ids = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "fixture", title: "Case", setting: "Place", victim: "Victim", logline: "Case", culpritKey: "fixed", reveal: ["PRIVATE SOLUTION"] });
    const groupId = await ctx.db.insert("groups", { name: "A", joinCode: "AAAAA", caseId, status: "active", day: 1, progress: 0, wrongAccusations: 0 });
    const otherGroup = await ctx.db.insert("groups", { name: "B", joinCode: "BBBBB", caseId, status: "active", day: 1, progress: 0, wrongAccusations: 0 });
    const players = await Promise.all(["A", "B", "C"].map((name) => ctx.db.insert("players", { groupId, name, joinedDay: 1, lateJoiner: false })));
    const outsider = await ctx.db.insert("players", { groupId: otherGroup, name: "Out", joinedDay: 1, lateJoiner: false });
    await ctx.db.insert("insights", { caseId, key: "insight", label: "Private insight", weight: 1, keywords: [["proof"]], hint: "PRIVATE HINT" });
    await ctx.db.insert("clues", { caseId, key: "clue", name: "Clue", kind: "evidence", summary: "Summary", detail: "PRIVATE DETAIL", unlock: { insight: "insight" } });
    return { caseId, groupId, players, outsider };
  });
  await t.mutation(initialize, { groupId: ids.groupId, graph: authoredGraph });
  return { t, ...ids };
}

async function earn(t: NonNullable<typeof activeTest>, groupId: Awaited<ReturnType<typeof fixture>>["groupId"]) {
  await t.run(async (ctx) => {
    await ctx.db.insert("progress", { groupId, insightKey: "insight", day: 1 });
    await ctx.db.insert("clueUnlocks", { groupId, clueKey: "clue", day: 1 });
  });
}

it("enforces authored gates, validates references and applies an atomic beat only once", async () => {
  const { t, groupId, caseId } = await fixture();
  const args = { groupId, beatKey: "start", eventKey: "beat", expectedVersion: 0 };
  await expect(t.mutation(transition, args)).rejects.toThrow("not eligible");
  await earn(t, groupId);
  expect(await Promise.all([t.mutation(transition, args), t.mutation(transition, args)])).toEqual([1, 1]);
  await expect(t.mutation(transition, { ...args, eventKey: "different", expectedVersion: 1 })).rejects.toThrow("not eligible");
  await expect(t.mutation(transition, { ...args, beatKey: "right" })).rejects.toThrow("Conflicting event");
  await expect(t.mutation(openDecision, { groupId, decisionKey: "first", eventKey: "open", expectedVersion: 0 })).rejects.toThrow("Stale version");
  expect(await t.mutation(initialize, { groupId, graph: fixtureGraph })).toBeTruthy();
  await expect(t.mutation(initialize, { groupId, graph: { ...fixtureGraph, beats: [] } })).rejects.toThrow("immutable");
  const freshGroup = await t.run(async (ctx) => ctx.db.insert("groups", { name: "Fresh", joinCode: "FRESH", caseId, status: "active", day: 1, progress: 0, wrongAccusations: 0 }));
  await expect(t.mutation(initialize, { groupId: freshGroup, graph: { ...fixtureGraph, beats: [{ ...fixtureGraph.beats[0], requiredClues: ["missing"] }] } })).rejects.toThrow("prerequisite");
  await expect(t.mutation(initialize, { groupId: freshGroup, graph: { ...fixtureGraph, beats: [{ ...fixtureGraph.beats[0], requiredFlags: { never_written: true } }] } })).rejects.toThrow("prerequisite");
  await expect(t.mutation(initialize, { groupId: freshGroup, graph: { caseKey: "fixture", decisions: [], beats: [{ ...fixtureGraph.beats[0], requiredFlags: { cycle: true }, effects: [{ kind: "flag", key: "cycle", value: true }] }] } })).rejects.toThrow("Unreachable");
  await expect(t.mutation(initialize, { groupId: freshGroup, graph: { ...fixtureGraph, beats: [{ ...fixtureGraph.beats[0], effects: [{ kind: "unlockClue", clueKey: "clue" }] }] } })).rejects.toThrow();
  const rows = await t.run(async (ctx) => ({ states: await ctx.db.query("storyStates").collect(), events: await ctx.db.query("storyOperations").collect() }));
  expect(rows.states[0].doneBeats).toEqual(["start"]);
  expect(rows.events).toHaveLength(1);
});

it.each(["left", "right"] as const)("produces a shared %s branch through two decisions without changing the solution", async (choice) => {
  const { t, groupId, players, caseId, outsider } = await fixture();
  await earn(t, groupId);
  let version = await t.mutation(transition, { groupId, beatKey: "start", eventKey: "start", expectedVersion: 0 });
  version = await t.mutation(openDecision, { groupId, decisionKey: "first", eventKey: "open1", expectedVersion: version });
  const first = (await t.query(snapshot, { groupId, playerId: players[0] })).decisions[0].id;
  await expect(t.mutation(vote, { groupId, decisionId: first, playerId: outsider, optionKey: choice, eventKey: "outsider", expectedVersion: version })).rejects.toThrow("membership");
  await expect(t.mutation(vote, { groupId, decisionId: first, playerId: players[0], optionKey: "bad", eventKey: "bad", expectedVersion: version })).rejects.toThrow("option");
  const firstVote = { groupId, decisionId: first, playerId: players[0], optionKey: choice, eventKey: "v1", expectedVersion: version };
  expect(await Promise.all([t.mutation(vote, firstVote), t.mutation(vote, firstVote)])).toEqual([version + 1, version + 1]);
  version++;
  await expect(t.mutation(vote, { ...firstVote, optionKey: choice === "left" ? "right" : "left" })).rejects.toThrow("Conflicting event");
  await expect(t.mutation(vote, { ...firstVote, eventKey: "duplicate", expectedVersion: version })).rejects.toThrow("already voted");
  for (const [index, playerId] of players.slice(1).entries()) version = await t.mutation(vote, { groupId, decisionId: first, playerId, optionKey: choice, eventKey: `v${index + 2}`, expectedVersion: version });
  version = await t.mutation(transition, { groupId, beatKey: choice, eventKey: "branch", expectedVersion: version });
  await expect(t.mutation(transition, { groupId, beatKey: choice === "left" ? "right" : "left", eventKey: "wrong-branch", expectedVersion: version })).rejects.toThrow("not eligible");
  version = await t.mutation(openDecision, { groupId, decisionKey: "second", eventKey: "open2", expectedVersion: version });
  const second = (await t.query(snapshot, { groupId, playerId: players[0] })).decisions[1].id;
  for (const [index, playerId] of players.entries()) version = await t.mutation(vote, { groupId, decisionId: second, playerId, optionKey: choice === "left" ? "a" : "b", eventKey: `s${index}`, expectedVersion: version });
  const views = await Promise.all(players.map((playerId) => t.query(snapshot, { groupId, playerId })));
  expect(views.map((view) => view.route)).toEqual(Array(3).fill(choice === "left" ? "ending-a" : "ending-b"));
  const story = await t.run(async (ctx) => ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique());
  expect(story?.doneBeats).toEqual(["start", choice]);
  expect(JSON.stringify(views)).not.toMatch(/PRIVATE|fixed|culprit|insight|clue/);
  const solution = await t.run(async (ctx) => ctx.db.get(caseId));
  expect(solution?.culpritKey).toBe("fixed");
  expect(solution?.reveal).toEqual(["PRIVATE SOLUTION"]);
  await expect(t.query(snapshot, { groupId, playerId: outsider })).rejects.toThrow();
});

it("uses authored tie and no-vote defaults at the logical deadline and rejects late votes", async () => {
  const { t, groupId, players } = await fixture();
  await earn(t, groupId);
  let version = await t.mutation(transition, { groupId, beatKey: "start", eventKey: "start", expectedVersion: 0 });
  version = await t.mutation(openDecision, { groupId, decisionKey: "first", eventKey: "open1", expectedVersion: version });
  const first = (await t.query(snapshot, { groupId, playerId: players[0] })).decisions[0].id;
  version = await t.mutation(vote, { groupId, decisionId: first, playerId: players[0], optionKey: "left", eventKey: "a", expectedVersion: version });
  version = await t.mutation(vote, { groupId, decisionId: first, playerId: players[1], optionKey: "right", eventKey: "b", expectedVersion: version });
  await expect(t.mutation(resolveDeadline, { groupId, decisionId: first, eventKey: "early", expectedVersion: version })).rejects.toThrow("Deadline not reached");
  await t.run(async (ctx) => ctx.db.patch(groupId, { gameTimeOffsetMs: 1000 }));
  await expect(t.mutation(vote, { groupId, decisionId: first, playerId: players[2], optionKey: "left", eventKey: "late", expectedVersion: version })).rejects.toThrow("closed");
  version = await t.mutation(resolveDeadline, { groupId, decisionId: first, eventKey: "resolve1", expectedVersion: version });
  expect((await t.query(snapshot, { groupId, playerId: players[0] })).route).toBe("right-route");
  version = await t.mutation(openDecision, { groupId, decisionKey: "second", eventKey: "open2", expectedVersion: version });
  const second = (await t.query(snapshot, { groupId, playerId: players[0] })).decisions[1].id;
  await t.run(async (ctx) => ctx.db.patch(groupId, { gameTimeOffsetMs: 2000 }));
  const args = { groupId, decisionId: second, eventKey: "resolve2", expectedVersion: version };
  expect(await Promise.all([t.mutation(resolveDeadline, args), t.mutation(resolveDeadline, args)])).toEqual([version + 1, version + 1]);
  expect((await t.query(snapshot, { groupId, playerId: players[0] })).route).toBe("ending-a");
});

it("freezes the electorate and rejects conflicting concurrent versions", async () => {
  const { t, groupId, players } = await fixture();
  await earn(t, groupId);
  const version = await t.mutation(transition, { groupId, beatKey: "start", eventKey: "start", expectedVersion: 0 });
  const opening = { groupId, decisionKey: "first", eventKey: "open", expectedVersion: version };
  expect(await Promise.all([t.mutation(openDecision, opening), t.mutation(openDecision, opening)])).toEqual([version + 1, version + 1]);
  const decisionId = (await t.query(snapshot, { groupId, playerId: players[0] })).decisions[0].id;
  const lateJoiner = await t.run(async (ctx) => ctx.db.insert("players", { groupId, name: "Late", joinedDay: 1, lateJoiner: true }));
  await expect(t.mutation(vote, { groupId, decisionId, playerId: lateJoiner, optionKey: "left", eventKey: "late-joiner", expectedVersion: version + 1 })).rejects.toThrow("membership");
  const results = await Promise.allSettled(players.slice(0, 2).map((playerId, index) => t.mutation(vote, {
    groupId, decisionId, playerId, optionKey: "left", eventKey: `concurrent-${index}`, expectedVersion: version + 1,
  })));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect((await t.query(snapshot, { groupId, playerId: lateJoiner })).decisions[0].eligible).toBe(false);
});

it("shares the version and preserves story state across real runtime consults", async () => {
  const { t, groupId, players } = await fixture();
  await earn(t, groupId);
  const consult = async () => {
    const messageId = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId: players[0], source: "keiki", kind: "chat", lineId: "1", body: "hello" }));
    await t.mutation(processConsult, { groupId, playerId: players[0], messageId, lineId: "1" });
  };
  await consult();
  const beat = { groupId, beatKey: "start", eventKey: "start", expectedVersion: 0 };
  await expect(t.mutation(transition, beat)).rejects.toThrow("Stale version");
  let version = await t.mutation(transition, { ...beat, expectedVersion: 1 });
  version = await t.mutation(openDecision, { groupId, decisionKey: "first", eventKey: "open", expectedVersion: version });
  const decisionId = (await t.query(snapshot, { groupId, playerId: players[0] })).decisions[0].id;
  version = await t.mutation(vote, { groupId, decisionId, playerId: players[0], optionKey: "left", eventKey: "v1", expectedVersion: version });
  await consult();
  const next = { groupId, decisionId, playerId: players[1], optionKey: "left", eventKey: "v2", expectedVersion: version };
  await expect(t.mutation(vote, next)).rejects.toThrow("Stale version");
  version = await t.mutation(vote, { ...next, expectedVersion: version + 1 });
  version = await t.mutation(vote, { groupId, decisionId, playerId: players[2], optionKey: "left", eventKey: "v3", expectedVersion: version });
  await consult();
  const state = await t.run(async (ctx) => ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect());
  expect(state).toHaveLength(1);
  expect(state[0]).toMatchObject({ version: version + 1, act: 1, doneBeats: ["start"], flags: { left: true } });
  expect((await t.query(snapshot, { groupId, playerId: players[0] })).route).toBe("left-route");
});

it("uses director order and rolls the logical day before checking a beat", async () => {
  const graph = { ...fixtureGraph, beats: [
    { ...fixtureGraph.beats[0], minDay: 2, forceAtDay: undefined },
    { ...fixtureGraph.beats[0], key: "also-eligible", minDay: 2, forceAtDay: undefined },
    ...fixtureGraph.beats.slice(1),
  ] };
  const { t, groupId } = await fixture(graph);
  await earn(t, groupId);
  await t.run(async (ctx) => ctx.db.patch(groupId, { dayOpenedAt: Date.now() - 86400000 }));
  expect(await t.mutation(planNext, { groupId })).toEqual({ version: 0, beatKey: "start" });
  await expect(t.mutation(transition, { groupId, beatKey: "also-eligible", eventKey: "out-of-order", expectedVersion: 0 })).rejects.toThrow("not eligible");
  expect(await t.mutation(transition, { groupId, beatKey: "start", eventKey: "start", expectedVersion: 0 })).toBe(1);
  expect((await t.run(async (ctx) => ctx.db.get(groupId)))?.day).toBe(2);
});

it("does not expose existing private runtime flags or beat identifiers", async () => {
  const { t, groupId, players } = await fixture();
  await t.run(async (ctx) => {
    const state = await ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique();
    await ctx.db.patch(state!._id, { flags: { PRIVATE_FLAG: true }, doneBeats: ["PRIVATE_BEAT"] });
  });
  expect(JSON.stringify(await t.query(snapshot, { groupId, playerId: players[1] }))).not.toMatch(/PRIVATE/);
});
