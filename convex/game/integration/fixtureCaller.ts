import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { projectedDay } from "../engine";

const dispatch = makeFunctionReference<"mutation", {
  groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: "1" | "2" | "3";
  caseId: Id<"cases">; day: number; command: unknown;
}, unknown>("game/commands/dispatch:dispatch");
const optionKeyForIndex = makeFunctionReference<"query", { groupId: Id<"groups">; playerId: Id<"players">; decisionId: Id<"storyDecisions">; optionIndex: number }, string>("game/story/engine:optionKeyForIndex");
const vote = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; decisionId: Id<"storyDecisions">; optionKey: string; eventKey: string; expectedVersion: number }, number>("game/story/engine:vote");

export const claimAndDispatchFixture = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), lineId: v.union(v.literal("1"), v.literal("2"), v.literal("3")), body: v.string(), command: v.any() },
  handler: async (ctx, args) => {
    const [group, player, fixture] = await Promise.all([
      ctx.db.get(args.groupId), ctx.db.get(args.playerId),
      ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).unique(),
    ]);
    if (!group || !player || player.groupId !== group._id || !fixture || fixture.caseId !== group.caseId || group.status !== "active") throw new Error("Invalid fixture caller");
    const cast = args.lineId === "1" ? null : await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", player._id).eq("lineId", args.lineId)).unique();
    if (args.lineId !== "1" && (!cast || cast.groupId !== group._id)) throw new Error("Character must enter on an earlier turn");
    const day = projectedDay(group);
    const messageId = await ctx.db.insert("messages", { groupId: group._id, playerId: player._id, source: "keiki", kind: "chat", body: args.body,
      lineId: args.lineId, agentKey: cast?.agentKey ?? "common", intakeCaseId: group.caseId, intakeDay: day });
    const result = await ctx.runMutation(dispatch, { groupId: group._id, playerId: player._id, messageId, lineId: args.lineId, caseId: group.caseId, day, command: args.command });
    return { messageId, result };
  },
});

export const claimAndVoteFixture = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), decisionId: v.id("storyDecisions"), optionIndex: v.number(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const [group, player, fixture] = await Promise.all([
      ctx.db.get(args.groupId), ctx.db.get(args.playerId),
      ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).unique(),
    ]);
    if (!group || group.status !== "active" || !player || player.groupId !== group._id || !fixture || fixture.caseId !== group.caseId) throw new Error("Invalid fixture caller");
    const optionKey = await ctx.runQuery(optionKeyForIndex, { groupId: args.groupId, playerId: args.playerId, decisionId: args.decisionId, optionIndex: args.optionIndex });
    const messageId = await ctx.db.insert("messages", { groupId: group._id, playerId: player._id, source: "keiki", kind: "chat", body: "", lineId: "1", agentKey: "common", intakeCaseId: group.caseId, intakeDay: projectedDay(group) });
    const version = await ctx.runMutation(vote, { groupId: group._id, playerId: player._id, decisionId: args.decisionId, optionKey, eventKey: `fixture-vote:${messageId}`, expectedVersion: args.expectedVersion });
    return { messageId, version };
  },
});
