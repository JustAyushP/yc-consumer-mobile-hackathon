import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export async function dailyStatus(ctx: QueryCtx, group: Doc<"groups">, playerId: Id<"players">) {
  const limit = group.dailyTurnLimit;
  if (limit === undefined || limit === 0) return { counter: null, completed: false, closed: false, limit: undefined };
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid daily turn limit");
  const [counter, sessions] = await Promise.all([
    ctx.db.query("brainDailyTurns").withIndex("by_player_day", (q) => q.eq("playerId", playerId).eq("day", group.day)).unique(),
    ctx.db.query("sessions").withIndex("by_player_day", (q) => q.eq("playerId", playerId).eq("day", group.day)).collect(),
  ]);
  if ((counter && (counter.groupId !== group._id || counter.caseId !== group.caseId)) || sessions.some((session) => session.groupId !== group._id)) throw new Error("Invalid daily session");
  const completed = sessions.some((session) => session.completed);
  return { counter, completed, closed: (counter?.turns ?? 0) >= limit || completed, limit };
}

export async function consumeDailyTurn(ctx: MutationCtx, group: Doc<"groups">, playerId: Id<"players">) {
  const state = await dailyStatus(ctx, group, playerId);
  if (state.limit === undefined) return undefined;
  if (state.closed) throw new Error("Daily session complete; return tomorrow");
  if (state.counter) await ctx.db.patch(state.counter._id, { turns: state.counter.turns + 1 });
  else await ctx.db.insert("brainDailyTurns", { groupId: group._id, caseId: group.caseId, playerId, day: group.day, turns: 1 });
  return { turn: (state.counter?.turns ?? 0) + 1, limit: state.limit };
}
