/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { SURVEY } from "../catalog";
import { settleScheduled } from "../testScheduler.support";
import { dispatch } from "./dispatch";

vi.mock("./reviewedHints", async (importOriginal) => {
  const original = await importOriginal<typeof import("./reviewedHints")>();
  return { ...original, reviewedHintsForCase: (key: string) => key === "fixture" ? [{ caseKey: "fixture", insightKey: "insight", body: "Reviewed fixture" }] : [] };
});

type Command =
  | { kind: "survey"; answers: { questionKey: string; optionIndex: number }[] }
  | { kind: "answer"; questionKey: string; text: string }
  | { kind: "ability"; targetKey: string }
  | { kind: "hint"; insightKey: string }
  | { kind: "accusation"; suspectKey: string; reasoning: string };

const ref = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: "1" | "2" | "3"; caseId: Id<"cases">; day: number; command: Command }>("game/commands/dispatch:dispatch");
let test: ReturnType<typeof convexTest<typeof schema.tables>> | undefined;

async function setup() {
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  test = t;
  const ids = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "fixture", title: "Fixture", setting: "Place", victim: "Victim", logline: "Test", culpritKey: "culprit", reveal: ["Solution"] });
    const groupId = await ctx.db.insert("groups", { name: "A", joinCode: "AAAAA", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const otherGroupId = await ctx.db.insert("groups", { name: "B", joinCode: "BBBBB", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const playerId = await ctx.db.insert("players", { groupId, name: "Player", joinedDay: 1, lateJoiner: false });
    const otherPlayerId = await ctx.db.insert("players", { groupId: otherGroupId, name: "Other", joinedDay: 1, lateJoiner: false });
    const messageId = await ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId: "1", agentKey: "common", intakeCaseId: caseId, intakeDay: 1, body: "untrusted text" });
    await ctx.db.insert("questions", { caseId, day: 1, key: "question", prompt: "Question", reference: "Reference", insightKeys: [] });
    for (const key of ["culprit", "wrong"]) await ctx.db.insert("suspects", { caseId, key, name: key, title: "Title", bio: "Bio", interrogation: "Statement", profile: "Profile", records: "Records" });
    await ctx.db.insert("insights", { caseId, key: "insight", label: "Deduction", weight: 1, keywords: [["proof"]], hint: "Unreviewed" });
    await ctx.db.insert("clues", { caseId, key: "clue", name: "Clue", kind: "evidence", summary: "Public", detail: "Private detail", unlock: { insight: "insight" } });
    return { caseId, groupId, otherGroupId, playerId, otherPlayerId, messageId };
  });
  return { t, ...ids, lineId: "1" as const, day: 1 };
}

afterEach(async () => {
  if (test) await settleScheduled(test);
  test = undefined;
  vi.useRealTimers();
});

describe("trusted gameplay command boundary", () => {
  it("atomically links an answer, returns exact replays and rejects conflicting commands", async () => {
    expect(dispatch.isInternal).toBe(true);
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const args = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "answer" as const, questionKey: "question", text: "  explicit answer  " } };
    const result = await t.mutation(ref, args);
    expect(result.kind).toBe("answer");
    expect(await t.mutation(ref, args)).toEqual(result);
    await expect(t.mutation(ref, { ...args, command: { ...args.command, text: "different" } })).rejects.toThrow("Conflicting command receipt");
    await expect(t.mutation(ref, { ...args, command: { kind: "ability", targetKey: "clue" } })).rejects.toThrow("Conflicting command receipt");
    await settleScheduled(t);
    const state = await t.run(async (ctx) => ({ message: await ctx.db.get(messageId), answers: await ctx.db.query("answers").collect(), receipts: await ctx.db.query("commandReceipts").collect(), messages: await ctx.db.query("messages").collect() }));
    expect(state.message?.answerId).toBe(result.value);
    expect(state.answers).toMatchObject([{ groupId, playerId, day, questionKey: "question", text: "explicit answer" }]);
    expect(state.receipts).toHaveLength(1);
    expect(state.messages).toHaveLength(1);
  });

  it("rejects forged links, missing provenance, stale contexts and invalid answers without effects", async () => {
    const { t, caseId, groupId, otherGroupId, playerId, otherPlayerId, messageId, lineId, day } = await setup();
    const args = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    for (const change of [{ groupId: otherGroupId }, { playerId: otherPlayerId }, { lineId: "2" as const }]) await expect(t.mutation(ref, { ...args, ...change })).rejects.toThrow("Invalid command association");
    for (const patch of [{ source: "app" as const }, { kind: "hint" as const }, { agentKey: undefined }, { lineId: undefined }]) {
      await t.run(async (ctx) => ctx.db.patch(messageId, patch));
      await expect(t.mutation(ref, args)).rejects.toThrow("Invalid command association");
      await t.run(async (ctx) => ctx.db.patch(messageId, { source: "keiki", kind: "chat", lineId: "1", agentKey: "common" }));
    }
    await t.run(async (ctx) => ctx.db.patch(messageId, { intakeDay: undefined }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale or missing intake context");
    await t.run(async (ctx) => ctx.db.patch(messageId, { intakeDay: 1, intakeCaseId: undefined }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale or missing intake context");
    await t.run(async (ctx) => ctx.db.patch(messageId, { intakeCaseId: caseId, agentKey: "forged" }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Invalid conversation");
    await t.run(async (ctx) => ctx.db.patch(messageId, { agentKey: "common" }));
    await expect(t.mutation(ref, { ...args, command: { ...args.command, questionKey: "missing" } })).rejects.toThrow("not open today");
    await expect(t.mutation(ref, { ...args, command: { ...args.command, text: "  " } })).rejects.toThrow("empty");
    await t.run(async (ctx) => {
      const message = (await ctx.db.get(messageId))!;
      await ctx.db.patch(groupId, { dayOpenedAt: message._creationTime + 1 });
    });
    await expect(t.mutation(ref, args)).rejects.toThrow("predates the current day");
    await t.run(async (ctx) => ctx.db.patch(groupId, { dayOpenedAt: Date.now() }));
    await t.run(async (ctx) => ctx.db.patch(groupId, { day: 2 }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale or missing intake context");
    expect(await t.run(async (ctx) => ctx.db.query("answers").collect())).toEqual([]);
    expect(await t.run(async (ctx) => ctx.db.query("commandReceipts").collect())).toEqual([]);
  });

  it("refuses legacy answer/consult association and stale case replays", async () => {
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const args = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    const answerId = await t.run(async (ctx) => ctx.db.insert("answers", { groupId, playerId, day, questionKey: "question", text: "old" }));
    await expect(t.mutation(ref, args)).rejects.toThrow("association cannot be verified");
    await t.run(async (ctx) => ctx.db.delete(answerId));
    await t.run(async (ctx) => ctx.db.insert("storyEvents", { groupId, caseId, playerId, messageId, lineId, sheetJson: "null", contentJson: "{}", clueKeys: [], insightKeys: [], directiveJson: "{}" }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Message already associated");
    const event = await t.run(async (ctx) => ctx.db.query("storyEvents").first());
    await t.run(async (ctx) => ctx.db.delete(event!._id));
    await t.mutation(ref, args);
    await settleScheduled(t);
    await t.run(async (ctx) => {
      const other = await ctx.db.insert("cases", { key: "other", title: "Other", setting: "Place", victim: "Victim", logline: "Test", culpritKey: "other", reveal: ["Solution"] });
      await ctx.db.patch(groupId, { caseId: other });
    });
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale or missing intake context");
  });

  it("validates a complete survey and assigns a role exactly once", async () => {
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const answers = SURVEY.map((question) => ({ questionKey: question.id, optionIndex: 0 }));
    const args = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "survey" as const, answers } };
    for (const bad of [[...answers.slice(1), answers[1]], answers.map((answer, index) => ({ ...answer, optionIndex: index ? 0 : 99 }))]) await expect(t.mutation(ref, { ...args, command: { kind: "survey", answers: bad } })).rejects.toThrow("Invalid survey answers");
    expect(await t.mutation(ref, args)).toEqual({ kind: "survey", value: null });
    expect(await t.mutation(ref, args)).toEqual({ kind: "survey", value: null });
    const state = await t.run(async (ctx) => ({ player: await ctx.db.get(playerId), answers: await ctx.db.query("surveyAnswers").collect(), receipts: await ctx.db.query("commandReceipts").collect() }));
    expect(state.player?.roleKey).toBe("forensic");
    expect(state.answers).toHaveLength(SURVEY.length);
    expect(state.receipts).toHaveLength(1);
  });

  it("uses the existing ability gate and rechecks private result on replay", async () => {
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const args = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "ability" as const, targetKey: "clue" } };
    await t.run(async (ctx) => ctx.db.patch(playerId, { roleKey: "forensic" }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Nothing to find there");
    await t.run(async (ctx) => ctx.db.insert("clueUnlocks", { groupId, clueKey: "clue", day }));
    expect(await t.mutation(ref, args)).toEqual({ kind: "ability", value: "Private detail" });
    expect(await t.mutation(ref, args)).toEqual({ kind: "ability", value: "Private detail" });
    await t.run(async (ctx) => {
      const clue = (await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", caseId)).first())!;
      await ctx.db.patch(clue._id, { detail: "Changed" });
    });
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale command result");
  });

  it("uses only a reviewed fixture hint and respects the engine's weekly cap", async () => {
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const args = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "hint" as const, insightKey: "insight" } };
    await expect(t.mutation(ref, { ...args, command: { kind: "hint", insightKey: "unknown" } })).rejects.toThrow("No eligible reviewed hint");
    expect(await t.mutation(ref, args)).toEqual({ kind: "hint", value: true });
    expect(await t.mutation(ref, args)).toEqual({ kind: "hint", value: true });
    for (let i = 0; i < 3; i++) {
      const next = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId, agentKey: "common", intakeCaseId: caseId, intakeDay: day, body: "request" }));
      expect(await t.mutation(ref, { ...args, messageId: next })).toEqual({ kind: "hint", value: i < 2 });
    }
    expect(await t.run(async (ctx) => ctx.db.query("hints").collect())).toHaveLength(3);
    expect((await t.run(async (ctx) => ctx.db.query("hints").collect())).every((hint) => hint.body === "Reviewed fixture")).toBe(true);
  });

  it("accuses silently, replays without repeating effects, and preserves the fixed culprit", async () => {
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const args = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "accusation" as const, suspectKey: "wrong", reasoning: "reason" } };
    await expect(t.mutation(ref, { ...args, command: { ...args.command, suspectKey: "unknown" } })).rejects.toThrow("Invalid accusation");
    expect(await t.mutation(ref, args)).toEqual({ kind: "accusation", value: { correct: false } });
    expect(await t.mutation(ref, args)).toEqual({ kind: "accusation", value: { correct: false } });
    const next = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId, agentKey: "common", intakeCaseId: caseId, intakeDay: day, body: "accuse" }));
    const correct = { ...args, messageId: next, command: { ...args.command, suspectKey: "culprit" } };
    expect(await t.mutation(ref, correct)).toEqual({ kind: "accusation", value: { correct: true } });
    expect(await t.mutation(ref, correct)).toEqual({ kind: "accusation", value: { correct: true } });
    const state = await t.run(async (ctx) => ({ group: await ctx.db.get(groupId), kase: await ctx.db.get(caseId), messages: await ctx.db.query("messages").collect(), narration: await ctx.db.query("narration").collect() }));
    expect(state.group).toMatchObject({ status: "solved", solvedBy: playerId, wrongAccusations: 1 });
    expect(state.kase?.culpritKey).toBe("culprit");
    expect(state.messages).toHaveLength(2);
    expect(state.narration.filter((row) => row.kind === "reveal")).toHaveLength(1);
  });

  it("refuses to solve until accepted answers have been scored", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const answer = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    const result = await t.mutation(ref, answer);
    const next = await t.run(async (ctx) => ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId, agentKey: "common", intakeCaseId: caseId, intakeDay: day, body: "accuse" }));
    const accusation = { ...answer, messageId: next, command: { kind: "accusation" as const, suspectKey: "culprit", reasoning: "reason" } };
    await expect(t.mutation(ref, accusation)).rejects.toThrow("awaiting scoring");
    expect((await t.run(async (ctx) => ctx.db.get(groupId)))?.status).toBe("active");
    await settleScheduled(t);
    expect((await t.run(async (ctx) => ctx.db.get(result.value as Id<"answers">)))?.score).toBeDefined();
    expect(await t.mutation(ref, accusation)).toEqual({ kind: "accusation", value: { correct: true } });
  });

  it("validates private-line casts before writing and on replay", async () => {
    const { t, caseId, groupId, playerId, messageId, day } = await setup();
    await t.run(async (ctx) => ctx.db.patch(messageId, { lineId: "2", agentKey: "forged" }));
    const args = { caseId, day, groupId, playerId, messageId, lineId: "2" as const, command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    await expect(t.mutation(ref, args)).rejects.toThrow("Invalid conversation");
    await t.run(async (ctx) => ctx.db.patch(messageId, { agentKey: "culprit" }));
    await t.mutation(ref, args);
    await t.run(async (ctx) => ctx.db.patch(messageId, { agentKey: "wrong" }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Invalid conversation");
  });

  it("fails closed for ambiguous receipts and mismatched result kinds", async () => {
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const command = { kind: "ability" as const, targetKey: "clue" };
    const args = { caseId, day, groupId, playerId, messageId, lineId, command };
    const receipt = { caseId, day, groupId, playerId, messageId, lineId, command, result: { kind: "survey" as const, value: null } };
    const receiptId = await t.run(async (ctx) => ctx.db.insert("commandReceipts", receipt));
    await expect(t.mutation(ref, args)).rejects.toThrow("Conflicting command receipt");
    await t.run(async (ctx) => ctx.db.insert("commandReceipts", receipt));
    await expect(t.mutation(ref, args)).rejects.toThrow("Ambiguous command receipt");
    expect(await t.run(async (ctx) => ctx.db.get(receiptId))).not.toBeNull();
  });

  it("does not spend two hints when one message is replayed", async () => {
    const { t, caseId, groupId, playerId, messageId, lineId, day } = await setup();
    const args = { caseId, day, groupId, playerId, messageId, lineId, command: { kind: "hint" as const, insightKey: "insight" } };
    expect(await t.mutation(ref, args)).toEqual({ kind: "hint", value: true });
    expect(await t.mutation(ref, args)).toEqual({ kind: "hint", value: true });
    expect(await t.run(async (ctx) => ctx.db.query("commandReceipts").collect())).toHaveLength(1);
    expect(await t.run(async (ctx) => ctx.db.query("hints").collect())).toHaveLength(1);
  });
});
