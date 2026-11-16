/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, it } from "vitest";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { settleScheduled } from "../testScheduler.support";
import { accuse, accuseSilently } from "../accuse";

const silent = makeFunctionReference<"mutation", { playerId: Id<"players">; suspectKey: string; reasoning: string }, { correct: boolean }>("game/accuse:accuseSilently");

it("preserves legacy accusation behavior while the silent seam does not send chat", async () => {
  expect(accuse.isInternal).toBe(true);
  expect(accuseSilently.isInternal).toBe(true);
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  const { caseId, legacyGroup, silentGroup, legacyPlayer, silentPlayer } = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "fixture", title: "Fixture", setting: "Place", victim: "Victim", logline: "Test", culpritKey: "culprit", reveal: ["Solution"] });
    const legacyGroup = await ctx.db.insert("groups", { name: "Legacy", joinCode: "OLD", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const silentGroup = await ctx.db.insert("groups", { name: "Silent", joinCode: "NEW", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const legacyPlayer = await ctx.db.insert("players", { groupId: legacyGroup, name: "Legacy", joinedDay: 1, lateJoiner: false });
    const silentPlayer = await ctx.db.insert("players", { groupId: silentGroup, name: "Silent", joinedDay: 1, lateJoiner: false });
    return { caseId, legacyGroup, silentGroup, legacyPlayer, silentPlayer };
  });
  for (const [ref, playerId] of [[internal.game.accuse.accuse, legacyPlayer], [silent, silentPlayer]] as const) {
    expect(await t.mutation(ref, { playerId, suspectKey: "wrong", reasoning: " reason " })).toEqual({ correct: false });
    expect(await t.mutation(ref, { playerId, suspectKey: "culprit", reasoning: " reason " })).toEqual({ correct: true });
  }
  await settleScheduled(t);
  const state = await t.run(async (ctx) => ({ kase: await ctx.db.get(caseId), legacy: await ctx.db.get(legacyGroup), silent: await ctx.db.get(silentGroup), messages: await ctx.db.query("messages").collect(), narration: await ctx.db.query("narration").collect() }));
  expect(state.kase?.culpritKey).toBe("culprit");
  expect(state.legacy).toMatchObject({ status: "solved", solvedBy: legacyPlayer, wrongAccusations: 1 });
  expect(state.silent).toMatchObject({ status: "solved", solvedBy: silentPlayer, wrongAccusations: 1 });
  expect(state.messages.map((message) => message.groupId)).toEqual([legacyGroup, legacyGroup]);
  expect(state.narration.map((row) => row.groupId).sort()).toEqual([legacyGroup, silentGroup].sort());
});
