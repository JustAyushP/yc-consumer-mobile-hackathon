import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { groupPlayers } from "../game/lib";
import { currentGroup } from "../game/engine";

/** Once half the team has filed today's session, warn everyone who hasn't. */
export const checkLag = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.number(),
  handler: async (ctx, { groupId }) => {
    let group = await ctx.db.get(groupId);
    if (!group || group.status !== "active") return 0;
    group = await currentGroup(ctx, group);
    const players = (await groupPlayers(ctx, groupId)).filter((p) => p.roleKey && p.joinedDay <= group.day);
    const done = new Set(
      (await ctx.db.query("sessions").withIndex("by_group_day", (q) => q.eq("groupId", groupId).eq("day", group.day)).collect())
        .filter((s) => s.completed)
        .map((s) => s.playerId),
    );
    if (done.size * 2 < players.length) return 0;
    let warned = 0;
    for (const p of players) {
      if (done.has(p._id)) continue;
      const body = `Detective ${p.name}, you're lagging. ${done.size} of ${players.length} have filed Day ${group.day}. Miss it and it goes on your record.`;
      if (await ctx.runMutation(internal.game.engine.issueWarning, { groupId, playerId: p._id, kind: "lagging", body })) warned++;
    }
    return warned;
  },
});
