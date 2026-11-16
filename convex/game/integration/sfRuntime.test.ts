/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { SF_CASE_CANDIDATE, SF_CONTENT_REVISION } from "../../cases/sfCandidate";
import { settleScheduled } from "../testScheduler.support";
import { sfInvitation } from "./sfInvitations";

const install = makeFunctionReference<"mutation", Record<string, never>, Id<"cases">>("cases/installSf:installIsolatedSf");
const dispatch = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: "1" | "2" | "3"; caseId: Id<"cases">; day: number; command: unknown }, { kind: string; value: unknown }>("game/commands/dispatch:dispatch");
const recover = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; insightKey: string; text: string }, { credited: boolean }>("game/integration/recoverDeduction:recoverDeduction");
const solved = makeFunctionReference<"query", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: string }, { correct: true; reveal: string[] } | null>("game/integration/results:solvedResult");
let active: ReturnType<typeof convexTest<typeof schema.tables>> | undefined;
afterEach(async () => { if (active) await settleScheduled(active); active = undefined; vi.useRealTimers(); vi.unstubAllEnvs(); });

it("runs the isolated SF case through seven flexible segments with three private detectives and recovery", async () => {
  vi.useFakeTimers();
  vi.stubEnv("RAVO_OFFLINE", "1");
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}")); active = t;
  const caseId = await t.mutation(install, {});
  await expect(t.mutation(install, {})).rejects.toThrow("Empty game dataset");
  await expect(t.mutation(internal.cases.seed.seed, {})).rejects.toThrow("versioned case");
  const { groupId, players, outsider } = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", { name: "Detectives", joinCode: "SF001", caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0 });
    const players = await Promise.all((["forensic", "interrogator", "profiler"] as const).map((roleKey, index) => ctx.db.insert("players", { groupId, name: `Detective ${index + 1}`, roleKey, joinedDay: 0, lateJoiner: false })));
    for (const [index, playerId] of players.entries()) await ctx.db.insert("viewerTokens", { groupId, playerId, token: `sf-${index}`, expiresAt: Date.now() + 30 * 86400000 });
    const other = await ctx.db.insert("groups", { name: "Other", joinCode: "SF002", caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0 });
    const outsider = await ctx.db.insert("players", { groupId: other, name: "Outsider", joinedDay: 0, lateJoiner: false });
    return { groupId, players, outsider };
  });
  await t.mutation(internal.game.groups.start, { playerId: players[0] });
  expect((await t.query(api.game.viewer.board, { viewerToken: "sf-0" })).clues).toEqual([]);
  expect(await t.query(api.game.viewer.reveal, { viewerToken: "sf-0" })).toBeNull();
  const message = async (playerId: Id<"players">, body: string) => await t.run(async (ctx) => {
    const group = (await ctx.db.get(groupId))!;
    return await ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId: "1", agentKey: "common", intakeCaseId: caseId, intakeDay: group.day, body });
  });
  const talk = async (playerId: Id<"players">) => {
    const messageId = await message(playerId, "hello");
    return await t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId: "1", agentKey: "common" });
  };
  const answer = async (playerId: Id<"players">, questionKey: string, text: string) => {
    const messageId = await message(playerId, "structured answer");
    const day = (await t.run(async (ctx) => ctx.db.get(groupId)))!.day;
    const result = await t.mutation(dispatch, { groupId, playerId, messageId, lineId: "1", caseId, day, command: { kind: "answer", questionKey, text } });
    expect(result.kind).toBe("answer");
    return await t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId: "1", agentKey: "common", answerId: result.value as Id<"answers"> });
  };
  const startMessage = await message(players[0], "hello");
  const start = await t.action(internal.ravo.consult.consult, { groupId, playerId: players[0], messageId: startMessage, lineId: "1", agentKey: "common" });
  expect(start.guidance).toContain("The drawer is open");
  expect(start.guidance).toContain(sfInvitation(1, "forensic", 0));
  expect(start.nextQuestion).toBe("d1q1: What does the examination establish about Victor's nightcap?");
  expect(JSON.stringify(start)).not.toContain("d1q2");
  expect(JSON.stringify(start)).not.toContain("d2q1");
  expect(start.guidance).not.toContain("Ledger B");
  for (const suspectKey of ["s_margot", "s_leo"]) {
    const early = await message(players[0], "early accusation");
    await expect(t.mutation(dispatch, { groupId, playerId: players[0], messageId: early, lineId: "1", caseId, day: 1, command: { kind: "accusation", suspectKey, reasoning: "reason" } })).rejects.toThrow("Accusation is not available yet");
  }
  await expect(t.mutation(internal.game.accuse.accuse, { playerId: players[0], suspectKey: "s_margot", reasoning: "reason" })).rejects.toThrow("Accusation is not available yet");
  expect((await t.run(async (ctx) => ctx.db.get(groupId)))?.wrongAccusations).toBe(0);
  expect(await t.run(async (ctx) => ctx.db.query("commandReceipts").collect())).toEqual([]);
  expect((await t.query(api.game.viewer.board, { viewerToken: "sf-0" })).clues.map((clue) => clue.key).sort()).toEqual(["e_coroner", "e_glass"]);
  expect((await talk(players[1])).guidance).toContain(sfInvitation(1, "interrogator", 0));
  const secondSegment = await talk(players[2]);
  expect(secondSegment.guidance).toContain("Two glasses stood");
  expect(secondSegment.guidance).toContain(sfInvitation(2, "profiler", 0));
  const hintMessage = await message(players[1], "hint");
  expect(await t.mutation(dispatch, { groupId, playerId: players[1], messageId: hintMessage, lineId: "1", caseId, day: 1, command: { kind: "hint", insightKey: "i_poison" } })).toEqual({ kind: "hint", value: true });
  expect(await t.query(api.game.viewer.hints, { viewerToken: "sf-0" })).toEqual([]);
  expect(await t.query(api.game.viewer.hints, { viewerToken: "sf-1" })).toHaveLength(1);
  const forensicMessage = await message(players[0], "examine");
  const forensic = await t.mutation(dispatch, { groupId, playerId: players[0], messageId: forensicMessage, lineId: "1", caseId, day: 1, command: { kind: "ability", targetKey: "e_glass" } });
  expect(forensic.kind).toBe("ability");
  expect((await t.query(api.game.viewer.board, { viewerToken: "sf-0" })).myFindings).toHaveLength(1);
  expect((await t.query(api.game.viewer.board, { viewerToken: "sf-1" })).myFindings).toEqual([]);
  const afterAnswer = await answer(players[0], "d1q1", "I don't know");
  expect(afterAnswer.nextQuestion).toBe("d1q2: Does the lipstick glass place Vivian at the fatal serving?");
  expect(afterAnswer.nextQuestion).not.toContain("d1q1");
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, { groupId, playerId: players[0], messageId: startMessage, lineId: "1", agentKey: "common", directiveJson: JSON.stringify(start) })).toEqual({ authorized: false });
  await settleScheduled(t);
  const recoveryMessage = await message(players[0], "revisit evidence");
  await expect(t.mutation(recover, { groupId, playerId: players[0], messageId: recoveryMessage, insightKey: "i_mk", text: "Margot is the bookkeeper" })).rejects.toThrow("not authorized");
  const recovery = { groupId, playerId: players[0], messageId: recoveryMessage, insightKey: "i_poison", text: "Digitalis poisoned the bourbon" };
  await t.run(async (ctx) => ctx.db.patch(groupId, { dailyTurnLimit: 1 }));
  expect(await t.mutation(recover, recovery)).toEqual({ credited: true });
  expect(await t.mutation(recover, recovery)).toEqual({ credited: true });
  await expect(t.mutation(recover, { ...recovery, playerId: outsider })).rejects.toThrow();
  await expect(t.mutation(recover, { ...recovery, text: "other" })).rejects.toThrow();
  await expect(t.mutation(dispatch, { groupId, playerId: players[0], messageId: recoveryMessage, lineId: "1", caseId, day: 1, command: { kind: "answer", questionKey: "d1q1", text: "proof" } })).rejects.toThrow("Message already associated");
  expect((await t.action(internal.ravo.consult.consult, { groupId, playerId: players[0], messageId: recoveryMessage, lineId: "1", agentKey: "common" })).endTurn).toBe(false);
  expect((await t.run(async (ctx) => ctx.db.query("brainDailyTurns").withIndex("by_player_day", (q) => q.eq("playerId", players[0]).eq("day", 1)).unique()))?.turns).toBe(1);
  expect(await t.mutation(recover, recovery)).toEqual({ credited: true });
  await t.run(async (ctx) => ctx.db.patch(groupId, { dailyTurnLimit: 0 }));
  expect((await t.query(api.game.viewer.board, { viewerToken: "sf-1" })).clues.some((clue) => clue.key === "e_prescription")).toBe(false);
  expect(JSON.stringify(await t.query(api.game.viewer.story, { viewerToken: "sf-1" }))).not.toContain("Pharmacy Record");
  await answer(players[1], "d1q2", "Vivian's lipstick glass was earlier at the toast");
  await settleScheduled(t);
  expect((await talk(players[2])).guidance).toContain("fragments fell after the spill");
  await t.mutation(internal.game.engine.fastForwardDay, { groupId });
  expect((await talk(players[0])).guidance).toContain("journey needs a record");
  const interviewMessage = await message(players[1], "interview");
  expect((await t.mutation(dispatch, { groupId, playerId: players[1], messageId: interviewMessage, lineId: "1", caseId, day: 2, command: { kind: "ability", targetKey: "s_leo" } })).kind).toBe("ability");
  await answer(players[1], "d2q1", "Leo's taxi was away across town");
  await settleScheduled(t);
  expect((await talk(players[2])).guidance).toContain("Two initials are an address");
  await answer(players[2], "d2q2", "Margot is the bookkeeper");
  await settleScheduled(t);
  expect((await t.query(api.game.viewer.board, { viewerToken: "sf-0" })).clues.some((clue) => clue.key === "e_ledger")).toBe(false);
  const prematureHint = await message(players[1], "hint");
  await expect(t.mutation(dispatch, { groupId, playerId: players[1], messageId: prematureHint, lineId: "1", caseId, day: 2, command: { kind: "hint", insightKey: "i_ledger" } })).rejects.toThrow("SF hint is not authorized");
  expect(await t.mutation(internal.game.engine.giveHint, { groupId, playerId: players[1], insightKey: "i_ledger", body: "not yet" })).toBe(false);
  expect((await talk(players[0])).guidance).toContain("official accounts");
  expect((await t.query(api.game.viewer.board, { viewerToken: "sf-0" })).clues.some((clue) => clue.key === "e_ledger")).toBe(true);
  await answer(players[0], "d2q2", "Margot the bookkeeper; the ledger records skimmed receipts");
  await settleScheduled(t);
  await talk(players[1]);
  await t.mutation(internal.game.engine.fastForwardDay, { groupId });
  expect((await talk(players[2])).guidance).toContain("record of access and a record of time");
  const profileMessage = await message(players[2], "profile");
  expect((await t.mutation(dispatch, { groupId, playerId: players[2], messageId: profileMessage, lineId: "1", caseId, day: 3, command: { kind: "ability", targetKey: "s_margot" } })).kind).toBe("ability");
  await answer(players[0], "d3q1", "Margot collected her mother Edna's digitalis prescription");
  await answer(players[1], "d3q2", "Margot's coat at 1:58 contradicts her departure claim");
  await settleScheduled(t);
  await talk(players[2]);
  expect((await talk(players[2])).guidance).toContain("Bring the sources together");
  expect((await t.run(async (ctx) => ctx.db.query("brainSegments").first()))).toMatchObject({ index: 7, completed: false });
  await expect(t.mutation(internal.game.accuse.accuse, { playerId: players[0], suspectKey: "s_leo", reasoning: "reason" })).rejects.toThrow("Accusation is not available yet");
  await t.mutation(internal.game.engine.fastForwardDay, { groupId });
  await talk(players[0]);
  expect((await talk(players[1])).guidance).toContain("records are ready to compare");
  expect((await t.run(async (ctx) => ctx.db.query("brainSegments").first()))).toMatchObject({ index: 7, completed: true });
  expect((await t.query(api.game.viewer.me, { viewerToken: "sf-0" })).role?.key).toBe("forensic");
  expect((await t.query(api.game.viewer.history, { viewerToken: "sf-0" })).length).toBeGreaterThan(0);
  for (const lineId of ["2", "3"] as const) {
    const privateMessage = await t.run(async (ctx) => {
      await ctx.db.insert("casts", { groupId, playerId: players[0], lineId, agentKey: "s_leo" });
      return await ctx.db.insert("messages", { groupId, playerId: players[0], kind: "chat", source: "keiki", lineId, agentKey: "s_leo", intakeCaseId: caseId, intakeDay: 4, body: "accusation" });
    });
    for (const suspectKey of ["s_margot", "s_leo"]) await expect(t.mutation(dispatch, { groupId, playerId: players[0], messageId: privateMessage, lineId, caseId, day: 4, command: { kind: "accusation", suspectKey, reasoning: "reason" } })).rejects.toThrow("Make accusations in the common conversation");
  }
  expect(await t.run(async (ctx) => ctx.db.get(groupId))).toMatchObject({ status: "active", wrongAccusations: 0 });
  const accusationMessage = await message(players[0], "accusation");
  expect(await t.mutation(dispatch, { groupId, playerId: players[0], messageId: accusationMessage, lineId: "1", caseId, day: 4, command: { kind: "accusation", suspectKey: "s_margot", reasoning: "The records connect the evidence." } })).toEqual({ kind: "accusation", value: { correct: true } });
  expect(await t.query(solved, { groupId, playerId: players[0], messageId: accusationMessage, lineId: "1" })).toEqual({ correct: true, reveal: SF_CASE_CANDIDATE.reveal });
  expect(await t.query(solved, { groupId, playerId: players[1], messageId: accusationMessage, lineId: "1" })).toBeNull();
  expect((await t.query(api.game.viewer.reveal, { viewerToken: "sf-2" }))?.story).toEqual(SF_CASE_CANDIDATE.reveal);
  const segment = await t.run(async (ctx) => (await ctx.db.query("brainSegments").first())!);
  await t.run(async (ctx) => ctx.db.patch(segment._id, { index: 6, completed: true }));
  expect(await t.query(solved, { groupId, playerId: players[0], messageId: accusationMessage, lineId: "1" })).toBeNull();
  expect(await t.query(api.game.viewer.reveal, { viewerToken: "sf-2" })).toBeNull();
  expect(JSON.stringify(await t.query(api.game.viewer.story, { viewerToken: "sf-2" }))).not.toContain(SF_CASE_CANDIDATE.reveal[0]);
});

it("offers every role a distinct optional focus in each segment", () => {
  for (let segment = 1; segment <= 7; segment++) {
    const invitations = (["forensic", "interrogator", "profiler", "archivist"] as const).map((role) => sfInvitation(segment, role, 0));
    expect(new Set(invitations).size).toBe(4);
    expect(sfInvitation(segment, "forensic", 1)).toContain("Independently check an alternative interpretation");
    expect(sfInvitation(segment, "forensic", 1)).not.toEqual(invitations[0]);
  }
  expect(() => sfInvitation(8, "forensic", 0)).toThrow("Invalid SF segment");
});

it("withholds SF questions from roleless or private turns and outside their day and segment", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}")); active = t;
  const caseId = await t.mutation(install, {});
  const { groupId, player, roleless } = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", { name: "Team", joinCode: "SF005", caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0 });
    const player = await ctx.db.insert("players", { groupId, name: "One", roleKey: "forensic", joinedDay: 0, lateJoiner: false });
    await ctx.db.insert("players", { groupId, name: "Two", roleKey: "interrogator", joinedDay: 0, lateJoiner: false });
    await ctx.db.insert("players", { groupId, name: "Three", roleKey: "profiler", joinedDay: 0, lateJoiner: false });
    const roleless = await ctx.db.insert("players", { groupId, name: "Four", joinedDay: 0, lateJoiner: false });
    return { groupId, player, roleless };
  });
  await t.mutation(internal.game.groups.start, { playerId: player });
  const consult = async (playerId: Id<"players">, lineId: "1" | "2") => {
    const messageId = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId, body: "hello" }));
    return await t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId });
  };
  expect((await consult(roleless, "1")).nextQuestion).toBeUndefined();
  expect((await consult(player, "2")).nextQuestion).toBeUndefined();
  expect((await consult(player, "1")).nextQuestion).toContain("d1q1:");
  await t.mutation(internal.game.engine.fastForwardDay, { groupId });
  await t.mutation(internal.game.engine.fastForwardDay, { groupId });
  expect((await consult(player, "1")).nextQuestion).toBeUndefined();
});

it("reuses a recovery admission below the optional daily limit", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}")); active = t;
  const caseId = await t.mutation(install, {});
  const { groupId, player } = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", { name: "Team", joinCode: "SF004", caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0 });
    const player = await ctx.db.insert("players", { groupId, name: "One", roleKey: "forensic", joinedDay: 0, lateJoiner: false });
    await ctx.db.insert("players", { groupId, name: "Two", roleKey: "interrogator", joinedDay: 0, lateJoiner: false });
    await ctx.db.insert("players", { groupId, name: "Three", roleKey: "profiler", joinedDay: 0, lateJoiner: false });
    return { groupId, player };
  });
  await t.mutation(internal.game.groups.start, { playerId: player });
  const makeMessage = async () => await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId: player, kind: "chat", source: "keiki", lineId: "1", agentKey: "common", intakeCaseId: caseId, intakeDay: 1, body: "inspect" }));
  await t.action(internal.ravo.consult.consult, { groupId, playerId: player, messageId: await makeMessage(), lineId: "1", agentKey: "common" });
  await t.run(async (ctx) => ctx.db.patch(groupId, { dailyTurnLimit: 2 }));
  const messageId = await makeMessage();
  expect(await t.mutation(recover, { groupId, playerId: player, messageId, insightKey: "i_poison", text: "Digitalis poisoned the bourbon" })).toEqual({ credited: true });
  const turns = async () => (await t.run(async (ctx) => ctx.db.query("brainDailyTurns").withIndex("by_player_day", (q) => q.eq("playerId", player).eq("day", 1)).unique()))?.turns;
  expect(await turns()).toBe(1);
  await t.action(internal.ravo.consult.consult, { groupId, playerId: player, messageId, lineId: "1", agentKey: "common" });
  expect(await turns()).toBe(1);
});

it("withholds future segment evidence and rejects a changed SF revision", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}")); active = t;
  const caseId = await t.mutation(install, {});
  const { groupId, player, messageId, clueId } = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", { name: "Team", joinCode: "SF003", caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0 });
    const player = await ctx.db.insert("players", { groupId, name: "One", roleKey: "forensic", joinedDay: 0, lateJoiner: false });
    await ctx.db.insert("players", { groupId, name: "Two", roleKey: "interrogator", joinedDay: 0, lateJoiner: false });
    await ctx.db.insert("players", { groupId, name: "Three", roleKey: "profiler", joinedDay: 0, lateJoiner: false });
    await ctx.db.insert("viewerTokens", { groupId, playerId: player, token: "sf-safe", expiresAt: Date.now() + 30 * 86400000 });
    const messageId = await ctx.db.insert("messages", { groupId, playerId: player, kind: "chat", source: "keiki", lineId: "1", agentKey: "common", body: "hello" });
    const clue = (await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()).find((item) => item.key === "e_glass")!;
    return { groupId, player, messageId, clueId: clue._id };
  });
  await t.mutation(internal.game.groups.start, { playerId: player });
  const directive = await t.action(internal.ravo.consult.consult, { groupId, playerId: player, messageId, lineId: "1", agentKey: "common" });
  const auth = { groupId, playerId: player, messageId, lineId: "1", agentKey: "common", directiveJson: JSON.stringify(directive) };
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, auth)).toEqual({ authorized: true });
  const original = (await t.run(async (ctx) => ctx.db.get(clueId)))!.summary;
  await t.run(async (ctx) => ctx.db.patch(clueId, { summary: "CHANGED CONTENT" }));
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, auth)).toEqual({ authorized: false });
  await expect(t.query(api.game.viewer.board, { viewerToken: "sf-safe" })).rejects.toThrow("revision changed");
  await t.run(async (ctx) => ctx.db.patch(clueId, { summary: original }));
  await t.run(async (ctx) => ctx.db.patch(caseId, { contentRevision: undefined }));
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, auth)).toEqual({ authorized: false });
  await expect(t.query(api.game.viewer.board, { viewerToken: "sf-safe" })).rejects.toThrow("revision changed");
  await expect(t.mutation(internal.game.accuse.accuse, { playerId: player, suspectKey: "s_margot", reasoning: "reason" })).rejects.toThrow("not available yet");
  await t.run(async (ctx) => ctx.db.patch(caseId, { contentRevision: SF_CONTENT_REVISION }));
  await t.mutation(internal.game.engine.fastForwardDay, { groupId });
  await t.mutation(internal.game.engine.fastForwardDay, { groupId });
  const board = await t.query(api.game.viewer.board, { viewerToken: "sf-safe" });
  expect(board.clues.map((clue) => clue.key).sort()).toEqual(["e_coroner", "e_glass"]);
  const story = JSON.stringify(await t.query(api.game.viewer.story, { viewerToken: "sf-safe" }));
  expect(story).not.toContain("Taxi Receipt");
  expect(story).not.toContain("Cloakroom Ticket");
  expect((await t.query(internal.game.session.today, { playerId: player })).questions).toEqual([]);
});
