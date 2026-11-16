import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { configuredTransport, LINK_LIFETIME_MS, onboardingStatus } from "./playerLinkShared";

const failure = v.object({ ok: v.literal(false), code: v.literal("LINK_UNAVAILABLE") });
const transport = { agentId: v.string(), botId: v.string(), conversationId: v.string(), senderId: v.string() };

export const mint = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), tokenHash: v.string() },
  returns: v.union(failure, v.object({ ok: v.literal(true), linkExpiresAt: v.number() })),
  handler: async (ctx, args) => {
    const status = await onboardingStatus(ctx);
    const config = configuredTransport();
    if (!status.enabled || !config || !/^[0-9a-f]{64}$/.test(args.tokenHash)) return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    const [group, player, existing, binding] = await Promise.all([
      ctx.db.get(args.groupId), ctx.db.get(args.playerId),
      ctx.db.query("pendingPlayerLinks").withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash)).first(),
      ctx.db.query("keikiBindings").withIndex("by_player_line_active", (q) => q.eq("playerId", args.playerId).eq("lineId", "1").eq("active", true)).first(),
    ]);
    if (!group || group.caseId !== status.caseId || group.status === "solved" || !player || player.groupId !== group._id || existing || binding) return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    const linkExpiresAt = Date.now() + LINK_LIFETIME_MS;
    await ctx.db.insert("pendingPlayerLinks", { tokenHash: args.tokenHash, groupId: group._id, playerId: player._id, agentId: config.agentId, botId: config.botId, lineId: "1", expiresAt: linkExpiresAt });
    return { ok: true as const, linkExpiresAt };
  },
});

export const redeem = internalMutation({
  args: { tokenHash: v.string(), ...transport },
  returns: v.union(failure, v.object({ ok: v.literal(true), status: v.literal("linked") })),
  handler: async (ctx, args) => {
    const status = await onboardingStatus(ctx);
    const config = configuredTransport();
    if (!status.enabled || !config || !/^[0-9a-f]{64}$/.test(args.tokenHash) || args.agentId !== config.agentId || args.botId !== config.botId ||
        !args.senderId || args.senderId !== args.senderId.trim() || args.senderId.length > 256 || args.conversationId !== JSON.stringify(["telegram", args.botId, args.senderId])) return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    const links = await ctx.db.query("pendingPlayerLinks").withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash)).take(2);
    if (links.length !== 1) return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    const link = links[0];
    if (link.expiresAt <= Date.now() || link.consumedAt !== undefined || link.bindingId || link.agentId !== args.agentId || link.botId !== args.botId || link.lineId !== "1") return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    const [group, player, existingTransport, existingPlayer] = await Promise.all([
      ctx.db.get(link.groupId), ctx.db.get(link.playerId),
      ctx.db.query("keikiBindings").withIndex("by_transport", (q) => q.eq("agentId", args.agentId).eq("channel", "telegram").eq("conversationId", args.conversationId).eq("senderId", args.senderId).eq("lineId", "1")).first(),
      ctx.db.query("keikiBindings").withIndex("by_player_line_active", (q) => q.eq("playerId", link.playerId).eq("lineId", "1").eq("active", true)).first(),
    ]);
    if (!group || group.caseId !== status.caseId || group.status === "solved" || !player || player.groupId !== group._id || existingTransport || existingPlayer) return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    const bindingId = await ctx.db.insert("keikiBindings", { agentId: args.agentId, channel: "telegram", conversationId: args.conversationId, senderId: args.senderId, lineId: "1", playerId: player._id, groupId: group._id, active: true });
    await ctx.db.patch(link._id, { consumedAt: Date.now(), bindingId });
    return { ok: true as const, status: "linked" as const };
  },
});
