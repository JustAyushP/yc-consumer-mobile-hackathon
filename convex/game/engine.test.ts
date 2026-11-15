/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  const ids = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "case", title: "Case", setting: "Place", victim: "Victim", logline: "Case", culpritKey: "culprit", reveal: ["Solution"] });
    const groupId = await ctx.db.insert("groups", { name: "A", joinCode: "AAAAA", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const otherGroupId = await ctx.db.insert("groups", { name: "B", joinCode: "BBBBB", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const playerId = await ctx.db.insert("players", { groupId, name: "A", roleKey: "forensic", joinedDay: 1, lateJoiner: false });
    const teammateId = await ctx.db.insert("players", { groupId, name: "Teammate", roleKey: "profiler", joinedDay: 1, lateJoiner: false });
    const outsiderId = await ctx.db.insert("players", { groupId: otherGroupId, name: "B", roleKey: "forensic", joinedDay: 1, lateJoiner: false });
    await ctx.db.insert("viewerTokens", { groupId, playerId, token: "a", expiresAt: Date.now() + DAY * 10 });
    await ctx.db.insert("viewerTokens", { groupId, playerId: teammateId, token: "mate", expiresAt: Date.now() + DAY * 10 });
    await ctx.db.insert("viewerTokens", { groupId: otherGroupId, playerId: outsiderId, token: "b", expiresAt: Date.now() + DAY * 10 });
    await ctx.db.insert("insights", { caseId, key: "insight", label: "Deduction", weight: 1, keywords: [["proof"]], hint: "hint" });
    await ctx.db.insert("clues", { caseId, key: "clue", name: "Clue", kind: "evidence", summary: "Public", detail: "Secret", unlock: { insight: "insight" } });
    return { caseId, groupId, otherGroupId, playerId, teammateId, outsiderId };
  });
  return { t, ...ids };
}

afterEach(() => vi.useRealTimers());

describe("game state invariants", () => {
  it("deduplicates clues, insights and warnings and enforces clue gates", async () => {
    const { t, groupId, playerId } = await setup();
    expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: "clue" })).toBe(false);
    expect(await t.mutation(internal.game.engine.recordInsight, { groupId, playerId, insightKey: "insight" })).toBe(true);
    expect(await t.mutation(internal.game.engine.recordInsight, { groupId, playerId, insightKey: "insight" })).toBe(false);
    expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: "clue" })).toBe(true);
    expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: "clue" })).toBe(false);
    const warning = { groupId, playerId, kind: "missed" as const, body: "Missed" };
    expect(await t.mutation(internal.game.engine.issueWarning, warning)).toBe(true);
    expect(await t.mutation(internal.game.engine.issueWarning, warning)).toBe(false);
    expect(await t.run(async (ctx) => [await ctx.db.query("progress").collect(), await ctx.db.query("clueUnlocks").collect(), await ctx.db.query("warnings").collect()])).toMatchObject([[{}], [{}], [{}]]);
  });

  it("enforces the weekly group hint budget and rejects outsiders", async () => {
    const { t, groupId, playerId, outsiderId } = await setup();
    expect(await t.mutation(internal.game.engine.giveHint, { groupId, playerId: outsiderId, insightKey: "insight", body: "private" })).toBe(false);
    expect(await t.mutation(internal.game.engine.recordInsight, { groupId, playerId: outsiderId, insightKey: "insight" })).toBe(false);
    expect(await t.mutation(internal.game.engine.issueWarning, { groupId, playerId: outsiderId, kind: "lagging", body: "private" })).toBe(false);
    const results = await Promise.all(Array.from({ length: 4 }, () => t.mutation(internal.game.engine.giveHint, { groupId, playerId, insightKey: "insight", body: "hint" })));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await t.run(async (ctx) => (await ctx.db.query("hints").collect()).length)).toBe(3);
    for (let i = 0; i < 7; i++) await t.mutation(internal.game.engine.fastForwardDay, { groupId });
    expect(await t.mutation(internal.game.engine.giveHint, { groupId, playerId, insightKey: "insight", body: "new week" })).toBe(true);
  });

  it("uses the same missed and completed session transitions for rollover and fast-forward", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { t, groupId, otherGroupId, playerId, teammateId, outsiderId } = await setup();
    await t.mutation(internal.game.session.complete, { playerId });
    await t.mutation(internal.game.session.complete, { playerId });
    await t.mutation(internal.game.engine.fastForwardDay, { groupId: otherGroupId });
    vi.advanceTimersByTime(DAY);
    await t.mutation(internal.ravo.entry.rolloverGroup, { groupId });
    await t.mutation(internal.ravo.entry.rolloverGroup, { groupId: otherGroupId });
    const state = await t.run(async (ctx) => ({ group: await ctx.db.get(groupId), other: await ctx.db.get(otherGroupId), sessions: await ctx.db.query("sessions").collect(), warnings: await ctx.db.query("warnings").collect() }));
    expect(state.group?.day).toBe(2);
    expect(state.other?.day).toBe(3);
    expect(state.sessions.find((s) => s.playerId === playerId && s.day === 1)).toMatchObject({ completed: true, status: "completed" });
    expect(state.sessions.find((s) => s.playerId === outsiderId && s.day === 1)).toMatchObject({ completed: false, status: "missed" });
    expect(state.sessions.find((s) => s.playerId === teammateId && s.day === 1)).toMatchObject({ completed: false, status: "missed" });
    expect(state.warnings.filter((w) => w.groupId === groupId && w.kind === "missed")).toHaveLength(1);
    await t.mutation(internal.ravo.entry.rolloverGroup, { groupId });
    expect((await t.run(async (ctx) => ctx.db.get(groupId)))?.day).toBe(2);
  });

  it("rolls the day before accepting a session after the boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { t, groupId, playerId } = await setup();
    vi.advanceTimersByTime(DAY);
    await t.mutation(internal.game.session.complete, { playerId });
    const sessions = await t.run(async (ctx) => ctx.db.query("sessions").withIndex("by_player_day", (q) => q.eq("playerId", playerId)).collect());
    expect(sessions).toMatchObject([{ day: 1, status: "missed", completed: false }, { day: 2, status: "completed", completed: true }]);
    expect((await t.run(async (ctx) => ctx.db.get(groupId)))?.day).toBe(2);
  });

  it("sweeps groups in batches and continues long catch-ups", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
    const { t, caseId, groupId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(groupId, { dayOpenedAt: Date.now() - 9 * DAY });
      for (let i = 0; i < 50; i++) {
        await ctx.db.insert("groups", { name: `Group ${i}`, joinCode: `G${i}`, caseId, status: "active", day: 1, dayOpenedAt: Date.now() - DAY, progress: 0, wrongAccusations: 0 });
      }
    });
    await t.mutation(internal.ravo.entry.dailyCheck, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const groups = await t.run(async (ctx) => ctx.db.query("groups").collect());
    expect(groups.find((group) => group._id === groupId)?.day).toBe(10);
    expect(groups.filter((group) => group.name.startsWith("Group ")).every((group) => group.day === 2)).toBe(true);
  });

  it("does not expose locked clue detail through the forensic ability", async () => {
    const { t, groupId, playerId } = await setup();
    await expect(t.mutation(internal.game.session.useAbility, { playerId, targetKey: "clue" })).rejects.toThrow("Nothing to find there");
    await t.mutation(internal.game.engine.recordInsight, { groupId, playerId, insightKey: "insight" });
    await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: "clue" });
    expect(await t.mutation(internal.game.session.useAbility, { playerId, targetKey: "clue" })).toBe("Secret");
  });

  it("uses the current day for questions, joining and lag checks at a boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { t, caseId, groupId, playerId, teammateId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("questions", { caseId, day: 1, key: "old", prompt: "Old", reference: "Answer", insightKeys: [] });
      await ctx.db.insert("questions", { caseId, day: 2, key: "new", prompt: "New", reference: "Answer", insightKeys: [] });
    });
    await t.mutation(internal.game.session.complete, { playerId });
    vi.advanceTimersByTime(DAY);
    expect((await t.query(internal.game.session.today, { playerId })).questions.map((q) => q.key)).toEqual(["new"]);
    expect(await t.mutation(internal.ravo.pace.checkLag, { groupId })).toBe(0);
    expect((await t.run(async (ctx) => ctx.db.query("warnings").collect())).filter((w) => w.playerId === teammateId && w.day === 2 && w.kind === "lagging")).toEqual([]);
    await expect(t.mutation(internal.game.session.submitAnswer, { playerId, questionKey: "old", text: "answer" })).rejects.toThrow("not open today");
    await t.mutation(internal.game.session.submitAnswer, { playerId, questionKey: "new", text: "answer" });
    const joined = await t.mutation(internal.game.groups.join, { code: "AAAAA", playerName: "Newcomer" });
    expect((await t.run(async (ctx) => ctx.db.get(joined.playerId)))?.joinedDay).toBe(2);
    expect((await t.run(async (ctx) => ctx.db.query("warnings").collect())).filter((w) => w.playerId === joined.playerId)).toEqual([]);
  });

  it("rolls an overdue group before joining a new player", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { t, groupId } = await setup();
    vi.advanceTimersByTime(DAY);
    const joined = await t.mutation(internal.game.groups.join, { code: "AAAAA", playerName: "Newcomer" });
    await t.mutation(internal.game.roles.assign, { playerId: joined.playerId });
    expect((await t.run(async (ctx) => ctx.db.get(groupId)))?.day).toBe(2);
    expect((await t.run(async (ctx) => ctx.db.get(joined.playerId)))?.joinedDay).toBe(2);
    expect((await t.run(async (ctx) => ctx.db.query("warnings").collect())).filter((w) => w.playerId === joined.playerId)).toEqual([]);
  });

  it("rejects forged consult group, sender, line and character without casting", async () => {
    const { t, groupId, otherGroupId, playerId, outsiderId } = await setup();
    const messageId = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", body: "hello" }));
    await expect(t.action(internal.ravo.consult.consult, { groupId: otherGroupId, playerId: outsiderId, messageId, lineId: "1" })).rejects.toThrow();
    await expect(t.action(internal.ravo.consult.consult, { groupId, playerId: outsiderId, messageId, lineId: "1" })).rejects.toThrow();
    await expect(t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId: "4" })).rejects.toThrow();
    await expect(t.action(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId: "1", agentKey: "forged" })).rejects.toThrow();
    expect(await t.run(async (ctx) => ctx.db.query("casts").collect())).toEqual([]);
  });

  it("stores the approved transport binding and receipt shapes", async () => {
    const { t, groupId, playerId } = await setup();
    const result = await t.run(async (ctx) => {
      const messageId = await ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId: "1", body: "hello" });
      const bindingId = await ctx.db.insert("keikiBindings", { agentId: "agent", channel: "channel", conversationId: "conversation", senderId: "sender", lineId: "1", playerId, groupId, active: true });
      await ctx.db.insert("keikiReceipts", { eventKey: "binding:event", status: "pending", messageId, bindingId });
      const binding = await ctx.db.query("keikiBindings").withIndex("by_transport", (q) => q.eq("agentId", "agent").eq("channel", "channel").eq("conversationId", "conversation").eq("senderId", "sender").eq("lineId", "1")).first();
      const receipt = await ctx.db.query("keikiReceipts").withIndex("by_eventKey", (q) => q.eq("eventKey", "binding:event")).first();
      return { binding, receipt };
    });
    expect(result.binding).toMatchObject({ playerId, groupId, active: true });
    expect(result.receipt).toMatchObject({ eventKey: "binding:event", status: "pending" });
  });

  it("restricts private narration, hints and findings to their recipient", async () => {
    const { t, groupId, playerId, teammateId } = await setup();
    await t.mutation(internal.game.engine.giveHint, { groupId, playerId, insightKey: "insight", body: "private hint" });
    await t.run(async (ctx) => {
      await ctx.db.insert("messages", { groupId, playerId, kind: "warning", source: "ravo", body: "old private" });
      await ctx.db.insert("messages", { groupId, playerId, kind: "intro", source: "ravo", body: "old group introduction" });
      await ctx.db.insert("narration", { groupId, playerId, kind: "warning", body: "new private" });
      await ctx.db.insert("narration", { groupId, kind: "day", body: "shared" });
      await ctx.db.insert("sessions", { groupId, playerId, day: 1, completed: false, abilityTarget: "clue", abilityResult: "private finding" });
      await ctx.db.insert("warnings", { groupId, playerId, day: 0, kind: "missed" });
    });
    expect((await t.query(api.game.viewer.story, { viewerToken: "mate" })).map((r) => r.body)).toEqual(["old group introduction", "shared"]);
    expect(await t.query(api.game.viewer.hints, { viewerToken: "mate" })).toEqual([]);
    expect((await t.query(api.game.viewer.board, { viewerToken: "mate" })).myFindings).toEqual([]);
    expect((await t.query(api.game.viewer.hints, { viewerToken: "a" })).map((h) => h.body)).toEqual(["private hint"]);
    expect((await t.query(api.game.viewer.team, { viewerToken: "mate" })).detectives.find((p) => p.id === teammateId)?.isMe).toBe(true);
    expect(await t.query(api.game.viewer.history, { viewerToken: "mate" })).toEqual([]);
    expect(await t.query(api.game.viewer.history, { viewerToken: "a" })).toEqual([{ day: 0, completed: false, status: "missed" }, { day: 1, completed: false, status: "open" }]);
    await expect(t.query(api.game.viewer.story, { viewerToken: "invalid" })).rejects.toThrow();
  });
});
