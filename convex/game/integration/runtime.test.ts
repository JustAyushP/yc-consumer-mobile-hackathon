/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, expect, it, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { settleScheduled } from "../testScheduler.support";
import { SURVEY } from "../catalog";

vi.mock("../commands/reviewedHints", async (original) => {
  const actual = await original<typeof import("../commands/reviewedHints")>();
  return { ...actual, reviewedHintsForCase: (key: string) => key === "fixture-integration" ? [{ caseKey: key, insightKey: "proof", body: "Reviewed hint" }] : [] };
});

const ready = { minAct: 1, minDay: 1, insights: [], clues: [], flags: {} };
const sheet = (agentKey: string, name: string) => ({ agentKey, name, publicIdentity: `${name} identity`, publicVoice: "Measured voice", entry: ready, factKeys: ["public", "private"] });
const content = {
  characters: { caseKey: "fixture-integration", revision: "fixture-v1", common: sheet("common", "Sal, the night bartender"), characters: [sheet("a", "A"), sheet("b", "B")],
    castPlan: { forensic: { "2": ["a", "b"], "3": ["b"] }, interrogator: { "2": ["b", "a"], "3": ["a"] }, profiler: { "2": ["a"], "3": ["b"] }, archivist: { "2": ["b"], "3": ["a"] } },
    facts: [{ key: "public", text: "Reviewed public fact", audience: "group", requirements: ready }, { key: "private", text: "Forensic private fact", audience: "player", requirements: ready }] },
  roleFacts: { forensic: ["public", "private"], interrogator: ["public"], profiler: ["public"], archivist: ["public"] },
  pacing: { stallDays: 1, lagMissedSessions: 2, cooldownDays: 1, maxInterventionsPerProgress: 1 }, nudges: ["Review the evidence you already have."] };
const graph = { caseKey: "fixture-integration", routes: [{ key: "secret_left", publicLabel: "Left route" }, { key: "secret_right", publicLabel: "Right route" }],
  beats: [
    { key: "start", act: 1, requiredBeats: [], requiredInsights: [], requiredClues: [], requiredFlags: {}, effects: [] },
    { key: "left_ending", act: 2, requiredBeats: ["start"], requiredInsights: [], requiredClues: [], requiredFlags: { left: true }, effects: [] },
    { key: "right_ending", act: 2, requiredBeats: ["start"], requiredInsights: [], requiredClues: [], requiredFlags: { right: true }, effects: [] },
  ], decisions: [{ key: "secret_decision", publicLabel: "Where next?", requiredBeat: "start", durationMs: 86400000, tieOption: "l", defaultOption: "l",
    options: [{ key: "l", publicLabel: "Follow the left lead", effects: [{ kind: "flag" as const, key: "left", value: true }, { kind: "route" as const, key: "secret_left" }] },
      { key: "r", publicLabel: "Follow the right lead", effects: [{ kind: "flag" as const, key: "right", value: true }, { kind: "route" as const, key: "secret_right" }] }] }] };
const installFixture = makeFunctionReference<"mutation", { groupId: Id<"groups">; graph: typeof graph; content: typeof content }, null>("game/integration/fixtures:installFixture");
const claimAndDispatchFixture = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; lineId: "1" | "2" | "3"; body: string; command: unknown }, { messageId: Id<"messages">; result: unknown }>("game/integration/fixtureCaller:claimAndDispatchFixture");
const claimAndVoteFixture = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; decisionId: Id<"storyDecisions">; optionIndex: number; expectedVersion: number }, { messageId: Id<"messages">; version: number }>("game/integration/fixtureCaller:claimAndVoteFixture");
const recoverAnswer = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; answerId: Id<"answers">; lineId: string }, null>("game/integration/results:recoverAnswer");
const solvedResult = makeFunctionReference<"query", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: string }, { correct: true; reveal: string[] } | null>("game/integration/results:solvedResult");
const recast = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; lineId: "2" | "3"; agentKey: string; expectedVersion: number }, null>("game/integration/recast:requestFixtureRecast");
const dispatch = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: "1" | "2" | "3"; caseId: Id<"cases">; day: number; command: unknown }, unknown>("game/commands/dispatch:dispatch");
const silentAccusation = makeFunctionReference<"mutation", { playerId: Id<"players">; suspectKey: string; reasoning: string }, { correct: boolean }>("game/accuse:accuseSilently");
let test: ReturnType<typeof convexTest<typeof schema.tables>> | undefined;
afterEach(async () => { if (test) await settleScheduled(test); test = undefined; vi.unstubAllEnvs(); vi.useRealTimers(); });

async function setup() {
  vi.stubEnv("RAVO_OFFLINE", "1");
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}")); test = t;
  const ids = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "fixture-integration", title: "Fixture", setting: "Place", victim: "Victim", logline: "Test", culpritKey: "b", reveal: ["SOLUTION"] });
    const groupId = await ctx.db.insert("groups", { name: "Team", joinCode: "AAAAA", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const otherGroup = await ctx.db.insert("groups", { name: "Other", joinCode: "BBBBB", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const player = await ctx.db.insert("players", { groupId, name: "One", roleKey: "forensic", joinedDay: 0, lateJoiner: false });
    const teammate = await ctx.db.insert("players", { groupId, name: "Two", roleKey: "interrogator", joinedDay: 1, lateJoiner: false });
    const outsider = await ctx.db.insert("players", { groupId: otherGroup, name: "Other", roleKey: "forensic", joinedDay: 1, lateJoiner: false });
    for (const [key, name] of [["a", "A"], ["b", "B"]]) await ctx.db.insert("suspects", { caseId, key, name, title: "Title", bio: "SECRET BIO", interrogation: "SECRET INTERROGATION", profile: "SECRET PROFILE", records: "SECRET RECORDS" });
    await ctx.db.insert("insights", { caseId, key: "proof", label: "SECRET LABEL", weight: 1, keywords: [["proof"]], hint: "SECRET HINT" });
    await ctx.db.insert("questions", { caseId, day: 1, key: "q1", prompt: "Question one?", reference: "SECRET ANSWER", insightKeys: ["proof"] });
    await ctx.db.insert("questions", { caseId, day: 2, key: "q2", prompt: "Question two?", reference: "SECRET ANSWER", insightKeys: [] });
    return { caseId, groupId, player, teammate, outsider };
  });
  await t.mutation(installFixture, { groupId: ids.groupId, graph, content });
  return { t, ...ids };
}

async function turn(t: ReturnType<typeof convexTest<typeof schema.tables>>, groupId: Id<"groups">, playerId: Id<"players">, lineId: "1" | "2" | "3" = "1", agentKey?: string) {
  const messageId = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, lineId, agentKey, source: "keiki", kind: "chat", body: "untrusted text" }));
  const directive = await t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId, agentKey });
  return { messageId, directive };
}

it.each(["l", "r"])("integrates shared route %s with recipient-private context and replay", async (choice) => {
  const { t, groupId, player, teammate, outsider, caseId } = await setup();
  const first = await turn(t, groupId, player);
  expect(first.directive.guidance).toContain("Forensic private fact");
  expect(first.directive.guidance).toContain("Where next?");
  expect(JSON.stringify(first.directive)).not.toContain("secret_decision");
  const args = { groupId, playerId: player, messageId: first.messageId, lineId: "1", agentKey: "common", directiveJson: JSON.stringify(first.directive) };
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, args)).toEqual({ authorized: true });
  expect(await t.action(internal.ravo.consult.consult, { groupId, playerId: player, messageId: first.messageId, lineId: "1" })).toEqual(first.directive);
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, { ...args, playerId: outsider })).toEqual({ authorized: false });
  const decision = await t.run(async (ctx) => (await ctx.db.query("storyDecisions").collect())[0]);
  let version = await t.run(async (ctx) => (await ctx.db.query("storyStates").first())!.version);
  const optionIndex = choice === "l" ? 0 : 1;
  version = (await t.mutation(claimAndVoteFixture, { groupId, decisionId: decision._id, playerId: player, optionIndex, expectedVersion: version })).version;
  await t.mutation(claimAndVoteFixture, { groupId, decisionId: decision._id, playerId: teammate, optionIndex, expectedVersion: version });
  const second = await turn(t, groupId, teammate, "2");
  expect(second.directive.character.agentKey).toBe("b");
  expect(second.directive.guidance).not.toContain("Forensic private fact");
  expect(second.directive.guidance).toContain(choice === "l" ? "Follow the left lead" : "Follow the right lead");
  expect(JSON.stringify(second.directive)).not.toMatch(/SOLUTION|SECRET|secret_left|secret_right/);
  const state = await t.run(async (ctx) => ({ state: (await ctx.db.query("storyStates").first())!, instance: (await ctx.db.query("storyInstances").first())!, caseRecord: (await ctx.db.get(caseId))! }));
  expect(state.state.doneBeats).toEqual(["start", choice === "l" ? "left_ending" : "right_ending"]);
  expect(state.instance.route).toBe(choice === "l" ? "secret_left" : "secret_right");
  expect(state.caseRecord.culpritKey).toBe("b");
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, args)).toEqual({ authorized: false });
  await t.mutation(recast, { groupId, playerId: teammate, lineId: "2", agentKey: "a", expectedVersion: state.state.version });
  expect(await t.run(async (ctx) => (await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", teammate).eq("lineId", "2")).unique())?.agentKey)).toBe("b");
  expect((await turn(t, groupId, teammate, "2", "b")).directive.character.agentKey).toBe("b");
  expect((await turn(t, groupId, teammate, "2", "a")).directive.character.agentKey).toBe("a");
  await t.run(async (ctx) => ctx.db.patch(teammate, { roleKey: "profiler" }));
  await expect(t.action(internal.ravo.consult.consult, { groupId, playerId: teammate, messageId: second.messageId, lineId: "2" })).rejects.toThrow();
});

it("records safe pacing, late entry, trusted commands, recovery and solved result", async () => {
  vi.useFakeTimers();
  const { t, groupId, player, teammate, outsider, caseId } = await setup();
  await turn(t, groupId, player);
  const hint = await t.mutation(claimAndDispatchFixture, { groupId, playerId: player, lineId: "1", body: "hint", command: { kind: "hint", insightKey: "proof" } });
  expect(hint.result).toEqual({ kind: "hint", value: true });
  const ability = await t.mutation(claimAndDispatchFixture, { groupId, playerId: teammate, lineId: "1", body: "ability", command: { kind: "ability", targetKey: "a" } });
  expect(ability.result).toEqual({ kind: "ability", value: "SECRET INTERROGATION" });
  const abilityReplay = { groupId, playerId: teammate, messageId: ability.messageId, lineId: "1" as const, caseId, day: 1, command: { kind: "ability", targetKey: "a" } };
  expect(await t.mutation(dispatch, abilityReplay)).toEqual(ability.result);
  await expect(t.mutation(dispatch, { ...abilityReplay, playerId: outsider })).rejects.toThrow();
  await t.run(async (ctx) => ctx.db.patch(teammate, { roleKey: "profiler" }));
  await expect(t.mutation(dispatch, abilityReplay)).rejects.toThrow("Stale command result");
  await t.run(async (ctx) => ctx.db.patch(teammate, { roleKey: "interrogator" }));
  const surveyPlayer = await t.run(async (ctx) => ctx.db.insert("players", { groupId, name: "Survey", joinedDay: 1, lateJoiner: false }));
  const survey = await t.mutation(claimAndDispatchFixture, { groupId, playerId: surveyPlayer, lineId: "1", body: "survey", command: { kind: "survey", answers: SURVEY.map((question) => ({ questionKey: question.id, optionIndex: 0 })) } });
  expect(survey.result).toEqual({ kind: "survey", value: null });
  const answer = await t.mutation(claimAndDispatchFixture, { groupId, playerId: player, lineId: "1", body: "answer", command: { kind: "answer", questionKey: "q1", text: "proof" } });
  const answerId = (answer.result as { kind: "answer"; value: Id<"answers"> }).value;
  await expect(t.mutation(claimAndDispatchFixture, { groupId, playerId: player, lineId: "1", body: "solve early", command: { kind: "accusation", suspectKey: "b", reasoning: "reason" } })).rejects.toThrow("awaiting scoring");
  await expect(t.mutation(recoverAnswer, { groupId, playerId: outsider, messageId: answer.messageId, answerId, lineId: "1" })).rejects.toThrow();
  await t.run(async (ctx) => ctx.db.patch(groupId, { status: "solved" }));
  await expect(t.mutation(internal.game.engine.processAnswer, { answerId })).rejects.toThrow();
  await t.run(async (ctx) => ctx.db.patch(groupId, { status: "active" }));
  await t.run(async (ctx) => ctx.db.patch(answer.messageId, { intakeCaseId: undefined }));
  await expect(t.mutation(recoverAnswer, { groupId, playerId: player, messageId: answer.messageId, answerId, lineId: "1" })).rejects.toThrow();
  await t.run(async (ctx) => ctx.db.patch(answer.messageId, { intakeCaseId: caseId }));
  await t.mutation(recoverAnswer, { groupId, playerId: player, messageId: answer.messageId, answerId, lineId: "1" });
  expect((await t.run(async (ctx) => ctx.db.get(answerId)))?.score).toBe(1);
  await settleScheduled(t);
  await t.run(async (ctx) => ctx.db.patch(groupId, { day: 2, dayOpenedAt: Date.now() }));
  const late = await t.run(async (ctx) => ctx.db.insert("players", { groupId, name: "Late", roleKey: "profiler", joinedDay: 2, lateJoiner: true }));
  expect((await turn(t, groupId, late, "2")).directive.character.agentKey).toBe("a");
  const stalled = await turn(t, groupId, teammate);
  expect(stalled.directive.nextQuestion).toBe("Question two?");
  expect((await turn(t, groupId, teammate)).directive.nextQuestion).toBeUndefined();
  const wrong = await t.mutation(claimAndDispatchFixture, { groupId, playerId: player, lineId: "1", body: "wrong", command: { kind: "accusation", suspectKey: "a", reasoning: "reason" } });
  expect(wrong.result).toEqual({ kind: "accusation", value: { correct: false } });
  const solved = await t.mutation(claimAndDispatchFixture, { groupId, playerId: player, lineId: "1", body: "solve", command: { kind: "accusation", suspectKey: "b", reasoning: "reason" } });
  expect(await t.query(solvedResult, { groupId, playerId: player, messageId: solved.messageId, lineId: "1" })).toEqual({ correct: true, reveal: ["SOLUTION"] });
  expect(await t.query(solvedResult, { groupId, playerId: teammate, messageId: solved.messageId, lineId: "1" })).toBeNull();
  expect(await t.query(solvedResult, { groupId, playerId: player, messageId: wrong.messageId, lineId: "1" })).toBeNull();
  expect(await t.query(solvedResult, { groupId, playerId: player, messageId: solved.messageId, lineId: "2" })).toBeNull();
  await t.run(async (ctx) => ctx.db.patch(solved.messageId, { intakeCaseId: undefined }));
  expect(await t.query(solvedResult, { groupId, playerId: player, messageId: solved.messageId, lineId: "1" })).toBeNull();
  expect((await t.run(async (ctx) => ctx.db.get(caseId)))?.culpritKey).toBe("b");
});

it("resolves expired votes, withholds roleless facts, and detects a first observed stall", async () => {
  const { t, groupId, player } = await setup();
  const roleless = await t.run(async (ctx) => ctx.db.insert("players", { groupId, name: "New", joinedDay: 1, lateJoiner: true }));
  const opening = await turn(t, groupId, roleless);
  expect(opening.directive.guidance).not.toContain("Forensic private fact");
  await expect(turn(t, groupId, roleless, "2")).rejects.toThrow("Role required");
  const decision = await t.run(async (ctx) => (await ctx.db.query("storyDecisions").first())!);
  await t.run(async (ctx) => { await ctx.db.patch(decision._id, { deadline: Date.now() - 1 }); await ctx.db.patch(groupId, { day: 2, dayOpenedAt: Date.now() }); });
  const resolved = await turn(t, groupId, player);
  expect(resolved.directive.guidance).toContain("Follow the left lead");
  expect(resolved.directive.nextQuestion).toBe("Question two?");
  const state = await t.run(async (ctx) => ({ decision: await ctx.db.get(decision._id), story: await ctx.db.query("storyStates").first() }));
  expect(state.decision?.resolvedOption).toBe("l");
  expect(state.story?.doneBeats).toEqual(["start", "left_ending"]);
});

it("caps concurrent turns, allows exact closure replay, gates direct effects and resets on fast-forward", async () => {
  const { t, groupId, player, teammate, caseId } = await setup();
  await t.run(async (ctx) => { await ctx.db.patch(groupId, { dailyTurnLimit: 2 }); await ctx.db.patch(player, { roleKey: "interrogator" }); });
  const forged = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId: teammate, lineId: "1", source: "keiki", kind: "chat", body: "forged" }));
  await expect(t.action(internal.ravo.consult.consult, { groupId, playerId: player, messageId: forged, lineId: "1" })).rejects.toThrow();
  expect(await t.run(async (ctx) => ctx.db.query("brainDailyTurns").collect())).toEqual([]);
  const turns = await Promise.all([turn(t, groupId, player), turn(t, groupId, player), turn(t, groupId, player)]);
  const closed = turns.filter((item) => item.directive.endTurn);
  expect(closed).toHaveLength(1);
  expect(closed[0].directive.guidance).toContain("Return tomorrow");
  expect(closed[0].directive.nextQuestion).toBeUndefined();
  expect(await t.action(internal.ravo.consult.consult, { groupId, playerId: player, messageId: closed[0].messageId, lineId: "1" })).toEqual(closed[0].directive);
  const events = await t.run(async (ctx) => ctx.db.query("storyEvents").collect());
  const firstAdmitted = events.find((event) => event.dailyTurn === 1)!;
  const lastAdmitted = events.find((event) => event.dailyTurn === 2)!;
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, { groupId, playerId: player, messageId: firstAdmitted.messageId, lineId: "1", agentKey: "common", directiveJson: firstAdmitted.directiveJson })).toEqual({ authorized: true });
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, { groupId, playerId: player, messageId: lastAdmitted.messageId, lineId: "1", agentKey: "common", directiveJson: lastAdmitted.directiveJson })).toEqual({ authorized: true });
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, { groupId, playerId: player, messageId: closed[0].messageId, lineId: "1", agentKey: "common", directiveJson: JSON.stringify(closed[0].directive) })).toEqual({ authorized: true });
  expect((await t.run(async (ctx) => ctx.db.query("brainDailyTurns").withIndex("by_player_day", (q) => q.eq("playerId", player).eq("day", 1)).unique()))?.turns).toBe(2);
  await expect(t.mutation(internal.game.session.submitAnswer, { playerId: player, questionKey: "q1", text: "proof" })).rejects.toThrow("Daily session complete");
  await expect(t.mutation(internal.game.session.useAbility, { playerId: player, targetKey: "a" })).rejects.toThrow("Daily session complete");
  await expect(t.mutation(internal.game.engine.giveHint, { groupId, playerId: player, insightKey: "proof", body: "hint" })).rejects.toThrow("Daily session complete");
  await expect(t.mutation(internal.game.engine.recordInsight, { groupId, playerId: player, insightKey: "proof" })).rejects.toThrow("Daily session complete");
  await expect(t.mutation(internal.game.accuse.accuse, { playerId: player, suspectKey: "a", reasoning: "reason" })).rejects.toThrow("Daily session complete");
  await expect(t.mutation(silentAccusation, { playerId: player, suspectKey: "b", reasoning: "reason" })).rejects.toThrow("Daily session complete");
  await expect(t.mutation(claimAndDispatchFixture, { groupId, playerId: player, lineId: "1", body: "answer", command: { kind: "answer", questionKey: "q1", text: "proof" } })).rejects.toThrow("Daily session complete");
  const decision = await t.run(async (ctx) => (await ctx.db.query("storyDecisions").first())!);
  let version = await t.run(async (ctx) => (await ctx.db.query("storyStates").first())!.version);
  version = (await t.mutation(claimAndVoteFixture, { groupId, playerId: player, decisionId: decision._id, optionIndex: 0, expectedVersion: version })).version;
  await t.mutation(claimAndVoteFixture, { groupId, playerId: teammate, decisionId: decision._id, optionIndex: 0, expectedVersion: version });
  expect((await turn(t, groupId, player)).directive.guidance).not.toContain("Follow the left lead");
  expect((await t.run(async (ctx) => ctx.db.get(caseId)))?.culpritKey).toBe("b");
  await t.mutation(internal.game.engine.fastForwardDay, { groupId });
  expect((await turn(t, groupId, player)).directive.endTurn).toBe(false);
  await expect(t.action(internal.ravo.consult.consult, { groupId, playerId: player, messageId: closed[0].messageId, lineId: "1" })).rejects.toThrow();
});

it("finishes an already-admitted last command without charging it twice", async () => {
  vi.useFakeTimers();
  const { t, groupId, player } = await setup();
  await t.run(async (ctx) => ctx.db.patch(groupId, { dailyTurnLimit: 1 }));
  const command = await t.mutation(claimAndDispatchFixture, { groupId, playerId: player, lineId: "1", body: "answer", command: { kind: "answer", questionKey: "q1", text: "proof" } });
  const answerId = (command.result as { kind: "answer"; value: Id<"answers"> }).value;
  const args = { groupId, playerId: player, messageId: command.messageId, lineId: "1", answerId };
  const result = await t.action(internal.ravo.consult.consult, args);
  expect(result.endTurn).toBe(false);
  expect(result.progressDelta).toBe(100);
  expect(await t.action(internal.ravo.consult.consult, args)).toEqual(result);
  expect((await t.run(async (ctx) => ctx.db.query("brainDailyTurns").first()))?.turns).toBe(1);
  expect((await turn(t, groupId, player)).directive.guidance).toContain("Return tomorrow");
});

it("automatically closes only explicitly required authored tasks and preserves answer replay", async () => {
  const { t, groupId, player, caseId } = await setup();
  const question = await t.run(async (ctx) => (await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", caseId).eq("day", 1)).first())!);
  await t.run(async (ctx) => ctx.db.patch(question._id, { requiredForSession: true }));
  const answerId = await t.mutation(internal.game.session.submitAnswer, { playerId: player, questionKey: "q1", text: "proof" });
  expect(await t.mutation(internal.game.session.submitAnswer, { playerId: player, questionKey: "q1", text: "proof" })).toBe(answerId);
  expect((await turn(t, groupId, player)).directive.guidance).toContain("Return tomorrow");
  await settleScheduled(t);
  expect((await t.run(async (ctx) => ctx.db.get(answerId)))?.score).toBe(1);
});

it("detects a first observation after an idle day without counting a beat as progress", async () => {
  const { t, groupId, player } = await setup();
  await t.run(async (ctx) => ctx.db.patch(groupId, { day: 2, dayOpenedAt: Date.now() }));
  const result = await turn(t, groupId, player);
  expect(result.directive.nextQuestion).toBe("Question two?");
});
