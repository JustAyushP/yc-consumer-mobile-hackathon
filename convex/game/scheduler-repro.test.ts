/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { settleScheduled } from "./testScheduler.support";

async function scheduledCheck() {
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  const playerId = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "case", title: "case", setting: "place", victim: "victim", logline: "case", culpritKey: "a", reveal: [] });
    const groupId = await ctx.db.insert("groups", { name: "A", joinCode: "A", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    return await ctx.db.insert("players", { groupId, name: "A", roleKey: "forensic", joinedDay: 1, lateJoiner: false });
  });
  await t.mutation(internal.game.session.complete, { playerId });
  return t;
}

it("detects a failed scheduled check when the clock changes before it settles", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const t = await scheduledCheck();
    vi.advanceTimersByTime(0);
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
    await expect(settleScheduled(t)).rejects.toThrow("ravo/pace:checkLag (failed)");
    expect(errors.mock.calls[0]?.[1]).toMatchObject({ message: "The case clock is catching up. Try again shortly." });
  } finally {
    errors.mockRestore();
    vi.useRealTimers();
  }
});

it("settles a scheduled check before changing the fake clock", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const errors = vi.spyOn(console, "error");
  try {
    const t = await scheduledCheck();
    await settleScheduled(t);
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
    await t.finishInProgressScheduledFunctions();
    const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.map((job) => job.state.kind)).toEqual(["success"]);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
    vi.useRealTimers();
  }
});
