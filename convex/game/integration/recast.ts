import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { planAssignment, type Snapshot } from "../../ravo/characters/lifecycle";
import type { FixtureContent } from "./fixtures";

export const requestFixtureRecast = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), lineId: v.union(v.literal("2"), v.literal("3")), agentKey: v.string(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const [group, player, fixture, state, recipient] = await Promise.all([
      ctx.db.get(args.groupId), ctx.db.get(args.playerId),
      ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).unique(),
      ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).unique(),
      ctx.db.query("brainRecipients").withIndex("by_player_line", (q) => q.eq("playerId", args.playerId).eq("lineId", args.lineId)).unique(),
    ]);
    if (!group || group.status !== "active" || !player || !player.roleKey || player.groupId !== group._id || !fixture || fixture.caseId !== group.caseId || !state || state.version !== args.expectedVersion || !recipient || recipient.groupId !== group._id || recipient.pendingAgentKey) throw new Error("Invalid or stale recast");
    const content = JSON.parse(fixture.contentJson) as FixtureContent;
    const [players, progress, unlocks, cast] = await Promise.all([
      ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", player._id).eq("lineId", args.lineId)).unique(),
    ]);
    if (!cast || cast.groupId !== group._id || cast.agentKey !== recipient.agentKey || recipient.contentRevision !== content.characters.revision) throw new Error("Cast changed");
    const role = player.roleKey;
    const snapshot: Snapshot = { caseKey: content.characters.caseKey, contentRevision: content.characters.revision,
      story: { day: group.day, act: state.act, version: state.version, doneBeats: state.doneBeats, flags: state.flags, creditedInsights: progress.map((item) => item.insightKey), unlockedClues: unlocks.map((item) => item.clueKey) },
      players: [{ id: player._id, role, roleOrdinal: players.filter((item) => (item.roleKey ?? "forensic") === role).findIndex((item) => item._id === player._id) }],
      assignments: [{ playerId: player._id, lineId: args.lineId, agentKey: recipient.agentKey }], deliveries: [], entitledFacts: { [player._id]: content.roleFacts[role] ?? [] } };
    planAssignment(content.characters, snapshot, player._id, args.lineId, args.agentKey);
    await ctx.db.patch(recipient._id, { pendingAgentKey: args.agentKey });
    await ctx.db.patch(state._id, { version: state.version + 1 });
    return null;
  },
});
