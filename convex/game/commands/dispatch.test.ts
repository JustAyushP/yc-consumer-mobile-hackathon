/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { SURVEY } from "../catalog";
import { settleScheduled } from "../testScheduler.support";
import { dispatch } from "./dispatch";

type Command =
  | { kind: "survey"; answers: { questionKey: string; optionIndex: number }[] }
  | { kind: "answer"; questionKey: string; text: string }
  | { kind: "ability"; targetKey: string }
  | { kind: "hint"; insightKey: string }
  | { kind: "accusation"; suspectKey: string; reasoning: string };

const ref = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: string; caseId: Id<"cases">; day: number; command: Command }>("game/commands/dispatch:dispatch");
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
    const messageId = await ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId: "1", body: "untrusted text" });
    await ctx.db.insert("questions", { caseId, day: 1, key: "question", prompt: "Question", reference: "Reference", insightKeys: [] });
    return { caseId, groupId, otherGroupId, playerId, otherPlayerId, messageId };
  });
  return { t, ...ids };
}

afterEach(async () => {
  if (test) await settleScheduled(test);
  test = undefined;
  vi.useRealTimers();
});

describe("trusted gameplay command boundary", () => {
  it("is internal and submits one linked current-day answer without chat output", async () => {
    expect(dispatch.isInternal).toBe(true);
    const { t, caseId, groupId, playerId, messageId } = await setup();
    const args = { caseId, day: 1, groupId, playerId, messageId, lineId: "1", command: { kind: "answer" as const, questionKey: "question", text: "  explicit answer  " } };
    const result = await t.mutation(ref, args);
    expect(result.kind).toBe("answer");
    const state = await t.run(async (ctx) => ({ message: await ctx.db.get(messageId), answers: await ctx.db.query("answers").collect(), messages: await ctx.db.query("messages").collect() }));
    expect(state.message?.answerId).toBe(result.answerId);
    expect(state.answers).toMatchObject([{ groupId, playerId, day: 1, questionKey: "question", text: "explicit answer" }]);
    expect(state.messages).toHaveLength(1);
    await expect(t.mutation(ref, args)).rejects.toThrow("Message already associated");
    await settleScheduled(t);
    expect(await t.run(async (ctx) => ctx.db.query("answers").collect())).toHaveLength(1);
    expect(await t.run(async (ctx) => ctx.db.query("messages").collect())).toHaveLength(1);
  });

  it("rejects forged associations and invalid day, question or empty answer", async () => {
    const { t, caseId, groupId, otherGroupId, playerId, otherPlayerId, messageId } = await setup();
    const args = { caseId, day: 1, groupId, playerId, messageId, lineId: "1", command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    for (const change of [{ groupId: otherGroupId }, { playerId: otherPlayerId }, { lineId: "2" }, { lineId: "4" }]) {
      await expect(t.mutation(ref, { ...args, ...change })).rejects.toThrow("Invalid command association");
    }
    for (const patch of [{ source: "app" as const }, { kind: "hint" as const }, { lineId: undefined }]) {
      await t.run(async (ctx) => ctx.db.patch(messageId, patch));
      await expect(t.mutation(ref, args)).rejects.toThrow("Invalid command association");
      await t.run(async (ctx) => ctx.db.patch(messageId, { source: "keiki", kind: "chat", lineId: "1" }));
    }
    await expect(t.mutation(ref, { ...args, command: { ...args.command, questionKey: "missing" } })).rejects.toThrow("not open today");
    await expect(t.mutation(ref, { ...args, command: { ...args.command, text: "  " } })).rejects.toThrow("empty");
    await t.run(async (ctx) => ctx.db.patch(messageId, { agentKey: "forged" }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Invalid conversation");
    await t.run(async (ctx) => ctx.db.patch(messageId, { agentKey: "common" }));
    await t.run(async (ctx) => ctx.db.patch(groupId, { day: 2 }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale command context");
    await expect(t.mutation(ref, { ...args, day: 2 })).rejects.toThrow("not open today");
    expect(await t.run(async (ctx) => ctx.db.query("answers").collect())).toEqual([]);
  });

  it("refuses to re-associate existing answers or consumed consult messages", async () => {
    const { t, caseId, groupId, playerId, messageId } = await setup();
    const args = { caseId, day: 1, groupId, playerId, messageId, lineId: "1", command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    await t.run(async (ctx) => ctx.db.insert("answers", { groupId, playerId, day: 1, questionKey: "question", text: "old" }));
    await expect(t.mutation(ref, args)).rejects.toThrow("association cannot be verified");
    await t.run(async (ctx) => ctx.db.insert("storyEvents", { groupId, caseId, playerId, messageId, lineId: "1", sheetJson: "null", contentJson: "{}", clueKeys: [], insightKeys: [], directiveJson: "{}" }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Message already associated");
  });

  it("uses the current cast assignment for a private line before applying an answer", async () => {
    const { t, caseId, groupId, playerId, messageId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("suspects", { caseId, key: "suspect", name: "Suspect", title: "Title", bio: "Bio", interrogation: "Statement", profile: "Profile", records: "Records" });
      await ctx.db.patch(messageId, { lineId: "2", agentKey: "forged" });
    });
    const args = { caseId, day: 1, groupId, playerId, messageId, lineId: "2", command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    await expect(t.mutation(ref, args)).rejects.toThrow("Invalid conversation");
    expect(await t.run(async (ctx) => ctx.db.query("casts").collect())).toEqual([]);
    await t.run(async (ctx) => ctx.db.patch(messageId, { agentKey: "suspect" }));
    expect((await t.mutation(ref, args)).kind).toBe("answer");
    expect(await t.run(async (ctx) => ctx.db.query("casts").collect())).toMatchObject([{ groupId, playerId, lineId: "2", agentKey: "suspect" }]);
  });

  it("refuses replays after the day or case changes", async () => {
    const { t, caseId, groupId, playerId, messageId } = await setup();
    const args = { caseId, day: 1, groupId, playerId, messageId, lineId: "1", command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    await t.mutation(ref, args);
    await settleScheduled(t);
    await t.run(async (ctx) => {
      const caseId = await ctx.db.insert("cases", { key: "other", title: "Other", setting: "Place", victim: "Victim", logline: "Test", culpritKey: "other", reveal: ["Solution"] });
      await ctx.db.patch(groupId, { caseId, day: 2 });
    });
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale command context");
    expect(await t.run(async (ctx) => ctx.db.query("answers").collect())).toHaveLength(1);
  });

  it("rejects stale intake context before associating an unconsumed message", async () => {
    const { t, caseId, groupId, playerId, messageId } = await setup();
    const args = { caseId, day: 1, groupId, playerId, messageId, lineId: "1", command: { kind: "answer" as const, questionKey: "question", text: "answer" } };
    await t.run(async (ctx) => ctx.db.patch(groupId, { day: 2 }));
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale command context");
    await t.run(async (ctx) => {
      const other = await ctx.db.insert("cases", { key: "other", title: "Other", setting: "Place", victim: "Victim", logline: "Test", culpritKey: "other", reveal: ["Solution"] });
      await ctx.db.patch(groupId, { caseId: other, day: 1 });
    });
    await expect(t.mutation(ref, args)).rejects.toThrow("Stale command context");
    await t.run(async (ctx) => {
      const message = (await ctx.db.get(messageId))!;
      await ctx.db.patch(groupId, { caseId, dayOpenedAt: message._creationTime + 1 });
    });
    await expect(t.mutation(ref, args)).rejects.toThrow("predates the current day");
    expect(await t.run(async (ctx) => ctx.db.query("answers").collect())).toEqual([]);
  });

  it("validates survey options and fails closed for repeat-sensitive commands", async () => {
    const { t, caseId, groupId, playerId, messageId } = await setup();
    const args = { caseId, day: 1, groupId, playerId, messageId, lineId: "1" };
    const answers = SURVEY.map((question) => ({ questionKey: question.id, optionIndex: 0 }));
    await expect(t.mutation(ref, { ...args, command: { kind: "survey", answers } })).resolves.toEqual({ kind: "unsupported", command: "survey" });
    for (const bad of [[...answers.slice(1), answers[1]], answers.map((answer, index) => ({ ...answer, optionIndex: index === 0 ? 99 : 0 }))]) {
      await expect(t.mutation(ref, { ...args, command: { kind: "survey", answers: bad } })).rejects.toThrow("Invalid survey answers");
    }
    for (const command of [{ kind: "ability", targetKey: "x" }, { kind: "hint", insightKey: "x" }, { kind: "accusation", suspectKey: "culprit", reasoning: "because" }] as Command[]) {
      for (let n = 0; n < 2; n++) expect(await t.mutation(ref, { ...args, command })).toEqual({ kind: "unsupported", command: command.kind });
    }
    const state = await t.run(async (ctx) => ({ group: await ctx.db.get(groupId), player: await ctx.db.get(playerId), messages: await ctx.db.query("messages").collect(), hints: await ctx.db.query("hints").collect(), sessions: await ctx.db.query("sessions").collect(), surveys: await ctx.db.query("surveyAnswers").collect(), jobs: await ctx.db.system.query("_scheduled_functions").collect() }));
    expect(state.group).toMatchObject({ status: "active", wrongAccusations: 0 });
    expect(state.player?.roleKey).toBeUndefined();
    expect([state.hints, state.sessions, state.surveys, state.jobs]).toEqual([[], [], [], []]);
    expect(state.messages).toHaveLength(1);
  });
});
