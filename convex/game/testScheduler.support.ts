import type { TestConvex } from "convex-test";
import { vi } from "vitest";
import schema from "../schema";

export async function settleScheduled(t: TestConvex<typeof schema>) {
  await t.finishAllScheduledFunctions(() => {
    if (vi.isFakeTimers()) vi.runAllTimers();
  });
  const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  const unfinished = jobs.filter((job) => job.state.kind !== "success" && job.state.kind !== "canceled");
  if (unfinished.length) throw new Error(`Scheduled functions did not succeed: ${unfinished.map((job) => `${job.name} (${job.state.kind})`).join(", ")}`);
}
