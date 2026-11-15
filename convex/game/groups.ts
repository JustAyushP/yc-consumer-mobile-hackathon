import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { MAX_PLAYERS, MIN_PLAYERS } from "./catalog";
import { openDayImpl } from "./engine";
import { groupPlayers, loadPlayer, makeCode } from "./lib";

const DEFAULT_CASE = "velvet-lantern";

export const create = internalMutation({
  args: { groupName: v.string(), playerName: v.string() },
  returns: v.object({ groupId: v.id("groups"), playerId: v.id("players"), joinCode: v.string() }),
  handler: async (ctx, { groupName, playerName }) => {
    const seeded = await ctx.db.query("cases").withIndex("by_key", (q) => q.eq("key", DEFAULT_CASE)).first();
    if (!seeded) throw new Error("No case seeded. Run: npx convex run cases/seed:seed");
    let code = makeCode();
    while (await ctx.db.query("groups").withIndex("by_joinCode", (q) => q.eq("joinCode", code)).first()) code = makeCode();
    const groupId = await ctx.db.insert("groups", {
      name: groupName.trim() || "The Night Shift",
      joinCode: code,
      caseId: seeded._id,
      status: "lobby",
      day: 0,
      progress: 0,
      wrongAccusations: 0,
    });
    const playerId = await ctx.db.insert("players", { groupId, name: playerName.trim() || "Anonymous", joinedDay: 0, lateJoiner: false });
    await ctx.db.patch(groupId, { hostId: playerId });
    return { groupId, playerId, joinCode: code };
  },
});

export const join = internalMutation({
  args: { code: v.string(), playerName: v.string() },
  returns: v.object({ groupId: v.id("groups"), playerId: v.id("players") }),
  handler: async (ctx, { code, playerName }) => {
    const group = await ctx.db.query("groups").withIndex("by_joinCode", (q) => q.eq("joinCode", code.trim().toUpperCase())).first();
    if (!group) throw new Error("No case with that code");
    if (group.status === "solved") throw new Error("That case is closed");
    if ((await groupPlayers(ctx, group._id)).length >= MAX_PLAYERS) throw new Error("This team is full");
    const playerId = await ctx.db.insert("players", {
      groupId: group._id,
      name: playerName.trim() || "Anonymous",
      joinedDay: group.day,
      lateJoiner: group.status === "active",
    });
    return { groupId: group._id, playerId };
  },
});

export const start = internalMutation({
  args: { playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const { group } = await loadPlayer(ctx, playerId);
    if (group.status !== "lobby") return null;
    const ready = (await groupPlayers(ctx, group._id)).filter((p) => p.roleKey);
    if (ready.length < MIN_PLAYERS) throw new Error(`RAVO needs ${MIN_PLAYERS} detectives with roles`);
    await openDayImpl(ctx, group, 1);
    return null;
  },
});
