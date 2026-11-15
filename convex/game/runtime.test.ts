/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const DAY = 86_400_000;

vi.mock("../ravo/director/content", () => ({
  reviewedContentForCase: (key: string) => key === "fixture" ? {
    beats: [], characters: { common: { publicIdentity: "Fixture identity", publicVoice: "Fixture voice", clueKeys: ["earned"] }, suspect: { publicIdentity: "", publicVoice: "", clueKeys: [] } }, insightLabels: {},
  } : { beats: [], characters: {}, insightLabels: {} },
}));

async function fixture() {
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  const ids = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "fixture", title: "Case", setting: "Place", victim: "Victim", logline: "Case", culpritKey: "fixed", reveal: ["SOLUTION SECRET"] });
    const groupId = await ctx.db.insert("groups", { name: "A", joinCode: "AAAAA", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const otherGroupId = await ctx.db.insert("groups", { name: "B", joinCode: "BBBBB", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const playerId = await ctx.db.insert("players", { groupId, name: "A", roleKey: "forensic", joinedDay: 1, lateJoiner: false });
    const teammateId = await ctx.db.insert("players", { groupId, name: "B", roleKey: "profiler", joinedDay: 1, lateJoiner: false });
    const outsiderId = await ctx.db.insert("players", { groupId: otherGroupId, name: "C", roleKey: "forensic", joinedDay: 1, lateJoiner: false });
    await ctx.db.insert("suspects", { caseId, key: "suspect", name: "Witness", title: "Title", bio: "PRIVATE BIO", interrogation: "PRIVATE TESTIMONY", profile: "PRIVATE PROFILE", records: "PRIVATE RECORDS" });
    await ctx.db.insert("insights", { caseId, key: "proof", label: "PRIVATE LABEL", weight: 1, keywords: [["proof"]], hint: "PRIVATE HINT" });
    const clueId = await ctx.db.insert("clues", { caseId, key: "earned", name: "Evidence", kind: "physical", summary: "PUBLIC SUMMARY", detail: "PRIVATE DETAIL", unlock: { insight: "proof" } });
    await ctx.db.insert("clues", { caseId, key: "locked", name: "LOCKED NAME", kind: "physical", summary: "LOCKED FACT", detail: "LOCKED DETAIL", unlock: { day: 4 } });
    await ctx.db.insert("questions", { caseId, day: 1, key: "q1", prompt: "What is the proof?", reference: "PRIVATE ANSWER", insightKeys: ["proof"] });
    await ctx.db.insert("questions", { caseId, day: 2, key: "q2", prompt: "What should we examine?", reference: "PRIVATE ANSWER TWO", insightKeys: [] });
    await ctx.db.insert("sessions", { groupId, playerId: teammateId, day: 1, completed: false, abilityResult: "PRIVATE ABILITY" });
    const messageId = await ctx.db.insert("messages", { groupId, playerId, source: "keiki", kind: "chat", lineId: "1", body: "proof" });
    const answerId = await ctx.db.insert("answers", { groupId, playerId, day: 1, questionKey: "q1", text: "proof" });
    await ctx.db.patch(messageId, { answerId });
    return { caseId, groupId, otherGroupId, playerId, teammateId, outsiderId, clueId, messageId, answerId };
  });
  return { t, ...ids };
}

afterEach(() => vi.useRealTimers());

it("processes a structured answer atomically, replays the directive and keeps private material out", async () => {
  const { t, groupId, playerId, teammateId, messageId, answerId, clueId, caseId } = await fixture();
  const args = { groupId, playerId, messageId, lineId: "1", answerId };
  const result = await t.action(internal.ravo.consult.consult, args);
  expect(result.reveal).toEqual({ clueId, text: "Evidence: PUBLIC SUMMARY" });
  expect(result.progressDelta).toBe(100);
  expect(result.guidance).toContain("Scripted guidance");
  expect(result.guidance).toContain("PUBLIC SUMMARY");
  expect(await t.action(internal.ravo.consult.consult, args)).toEqual(result);
  const cacheArgs = { groupId, playerId, messageId, lineId: "1", agentKey: "common", directiveJson: JSON.stringify(result) };
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, cacheArgs)).toEqual({ authorized: true });
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, { ...cacheArgs, directiveJson: "{}" })).toEqual({ authorized: false });
  await t.run(async (ctx) => ctx.db.patch(clueId, { summary: "REDACTED" }));
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, cacheArgs)).toEqual({ authorized: false });
  await t.run(async (ctx) => ctx.db.patch(clueId, { summary: "PUBLIC SUMMARY" }));
  await expect(t.action(internal.ravo.consult.consult, { ...args, answerId: undefined })).rejects.toThrow();
  const otherMessage = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId: teammateId, source: "keiki", kind: "chat", lineId: "2", body: "hi" }));
  const privateLine = await t.action(internal.ravo.consult.consult, { groupId, playerId: teammateId, messageId: otherMessage, lineId: "2" });
  expect(privateLine.character.agentKey).toBe("suspect");
  expect(privateLine.crossPlayer).toBeUndefined();
  const rendered = JSON.stringify([result, privateLine]);
  for (const secret of ["PRIVATE", "LOCKED", "SOLUTION SECRET"]) expect(rendered).not.toContain(secret);
  const state = await t.run(async (ctx) => ({ events: await ctx.db.query("storyEvents").collect(), story: await ctx.db.query("storyStates").collect(), progress: await ctx.db.query("progress").collect(), unlocks: await ctx.db.query("clueUnlocks").collect(), case: await ctx.db.get(caseId) }));
  expect(state.events).toHaveLength(2);
  expect(state.story[0].version).toBe(2);
  expect(state.progress).toHaveLength(1);
  expect(state.unlocks).toHaveLength(1);
  expect(state.case?.culpritKey).toBe("fixed");
  expect(state.case?.reveal).toEqual(["SOLUTION SECRET"]);
  const repeatedAnswerMessage = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, source: "keiki", kind: "chat", lineId: "1", body: "again", answerId }));
  await expect(t.action(internal.ravo.consult.consult, { ...args, messageId: repeatedAnswerMessage })).rejects.toThrow("Answer already processed");
  await t.run(async (ctx) => { for (const unlock of await ctx.db.query("clueUnlocks").collect()) await ctx.db.delete(unlock._id); });
  expect(await t.query(internal.ravo.consult.authorizeCachedDirective, cacheArgs)).toEqual({ authorized: false });
  await expect(t.action(internal.ravo.consult.consult, args)).rejects.toThrow("authorization changed");
});

it("coalesces concurrent consults and rejects replay after closure", async () => {
  const { t, groupId, playerId, messageId, answerId } = await fixture();
  const args = { groupId, playerId, messageId, lineId: "1", answerId };
  await t.action(internal.ravo.entry.onMessage, { groupId, messageId });
  expect(await t.run(async (ctx) => ctx.db.query("progress").collect())).toEqual([]);
  const results = await Promise.all([t.action(internal.ravo.consult.consult, args), t.action(internal.ravo.consult.consult, args)]);
  expect(results[0]).toEqual(results[1]);
  const state = await t.run(async (ctx) => ({ events: await ctx.db.query("storyEvents").collect(), progress: await ctx.db.query("progress").collect(), unlocks: await ctx.db.query("clueUnlocks").collect() }));
  expect(state.events).toHaveLength(1);
  expect(state.progress).toHaveLength(1);
  expect(state.unlocks).toHaveLength(1);
  await t.run(async (ctx) => ctx.db.patch(groupId, { status: "solved" }));
  await expect(t.action(internal.ravo.consult.consult, args)).rejects.toThrow();
});

it("withholds even earned clues when the character has no reviewed knowledge", async () => {
  const { t, caseId, groupId, playerId, messageId, answerId } = await fixture();
  await t.run(async (ctx) => ctx.db.patch(caseId, { key: "no-reviewed-content" }));
  const directive = await t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, answerId, lineId: "1" });
  expect(directive.progressDelta).toBe(100);
  expect(directive.reveal).toBeUndefined();
  expect(directive.guidance).not.toContain("PUBLIC SUMMARY");
  expect(await t.run(async (ctx) => ctx.db.query("clueUnlocks").collect())).toHaveLength(1);
});

it("rejects spoofed associations and does not infer progress from ordinary chat", async () => {
  const { t, groupId, otherGroupId, playerId, outsiderId, messageId, answerId } = await fixture();
  await expect(t.action(internal.ravo.consult.consult, { groupId: otherGroupId, playerId: outsiderId, messageId, lineId: "1" })).rejects.toThrow();
  await expect(t.action(internal.ravo.consult.consult, { groupId, playerId: outsiderId, messageId, lineId: "1" })).rejects.toThrow();
  await expect(t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId: "2" })).rejects.toThrow();
  await expect(t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId: "1", agentKey: "forged" })).rejects.toThrow();
  const missingLine = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, source: "keiki", kind: "chat", body: "hi" }));
  await expect(t.action(internal.ravo.consult.consult, { groupId, playerId, messageId: missingLine, lineId: "1" })).rejects.toThrow();
  await t.run(async (ctx) => ctx.db.patch(answerId, { playerId: outsiderId }));
  await expect(t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId: "1", answerId })).rejects.toThrow();
  await t.run(async (ctx) => ctx.db.patch(messageId, { answerId: undefined }));
  const directive = await t.action(internal.ravo.consult.consult, { groupId, messageId, lineId: "1" });
  expect(directive.reveal).toBeUndefined();
  expect(directive.progressDelta).toBe(0);
  expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: "earned" })).toBe(false);
  expect(await t.run(async (ctx) => ctx.db.query("progress").collect())).toEqual([]);
});

it("processes the real scheduled answer path atomically without chat delivery", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const { t, groupId, playerId, messageId, answerId: fixtureAnswerId } = await fixture();
  await t.run(async (ctx) => ctx.db.delete(fixtureAnswerId));
  const answerId = await t.mutation(internal.game.session.submitAnswer, { playerId, questionKey: "q1", text: "proof" });
  await t.run(async (ctx) => ctx.db.patch(messageId, { answerId }));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const first = await t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId: "1", answerId });
  expect(first.progressDelta).toBe(0);
  expect(first.reveal?.text).toBe("Evidence: PUBLIC SUMMARY");
  await t.action(internal.ravo.entry.onAnswer, { answerId });
  const state = await t.run(async (ctx) => ({ progress: await ctx.db.query("progress").collect(), unlocks: await ctx.db.query("clueUnlocks").collect(), answer: await ctx.db.get(answerId), messages: await ctx.db.query("messages").collect() }));
  expect(state.progress).toHaveLength(1);
  expect(state.unlocks).toHaveLength(1);
  expect(state.answer?.score).toBe(1);
  expect(state.messages.every((message) => message.source !== "ravo")).toBe(true);
});

it("provides a bounded current question after a stalled day without consuming hints", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const { t, groupId, playerId, messageId } = await fixture();
  await t.run(async (ctx) => ctx.db.patch(messageId, { answerId: undefined }));
  vi.advanceTimersByTime(DAY);
  const args = { groupId, playerId, messageId, lineId: "1" };
  const first = await t.action(internal.ravo.consult.consult, args);
  expect(first.nextQuestion).toBe("What should we examine?");
  expect(first.reveal).toBeUndefined();
  expect(await t.action(internal.ravo.consult.consult, args)).toEqual(first);
  const nextId = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, source: "keiki", kind: "chat", lineId: "1", body: "again" }));
  expect((await t.action(internal.ravo.consult.consult, { ...args, messageId: nextId })).nextQuestion).toBeUndefined();
  expect(await t.run(async (ctx) => ctx.db.query("hints").collect())).toEqual([]);
});

it("rolls a stale group as the first operation before joining", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const { t, groupId, playerId, teammateId } = await fixture();
  vi.advanceTimersByTime(DAY * 2);
  const joined = await t.mutation(internal.game.groups.join, { code: "AAAAA", playerName: "Late" });
  const state = await t.run(async (ctx) => ({ group: await ctx.db.get(groupId), joined: await ctx.db.get(joined.playerId), sessions: await ctx.db.query("sessions").withIndex("by_group_day", (q) => q.eq("groupId", groupId)).collect(), warnings: await ctx.db.query("warnings").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect() }));
  expect(state.group?.day).toBe(3);
  expect(state.joined).toMatchObject({ joinedDay: 3, lateJoiner: true });
  for (const id of [playerId, teammateId]) for (const day of [1, 2]) expect(state.sessions.find((s) => s.playerId === id && s.day === day)).toMatchObject({ completed: false, status: "missed" });
  expect(state.sessions.filter((s) => s.playerId === joined.playerId)).toEqual([]);
  expect(state.warnings.filter((w) => w.playerId === joined.playerId)).toEqual([]);
});
