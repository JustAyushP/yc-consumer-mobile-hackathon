import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { MAX_PLAYERS } from "./catalog";
import { currentGroup } from "./engine";
import { makeCode } from "./lib";
import { configuredTransport, LINK_LIFETIME_MS, onboardingStatus } from "./playerLinkShared";

const error = v.object({ ok: v.literal(false), code: v.union(v.literal("disabled"), v.literal("unconfigured"), v.literal("rejected")) });
const payload = v.union(
  v.object({ kind: v.literal("create"), groupName: v.string(), playerName: v.string() }),
  v.object({ kind: v.literal("join"), joinCode: v.string(), playerName: v.string() }),
);

export const begin = internalMutation({
  args: { sessionHash: v.string() },
  returns: v.union(error, v.object({ ok: v.literal(true), expiresAt: v.number() })),
  handler: async (ctx, { sessionHash }) => {
    const status = await onboardingStatus(ctx);
    if (!status.enabled) return { ok: false as const, code: status.reason };
    if (!/^[0-9a-f]{64}$/.test(sessionHash) || await ctx.db.query("demoOnboardingSessions").withIndex("by_session_hash", (q) => q.eq("sessionHash", sessionHash)).first()) return { ok: false as const, code: "rejected" as const };
    const budget = await ctx.db.query("demoOnboardingBudget").withIndex("by_key", (q) => q.eq("key", "demo")).unique();
    const hour = Math.floor(Date.now() / 3600000);
    const hourlySessions = budget?.hour === hour ? budget.hourlySessions : 0;
    if ((budget?.sessions ?? 0) >= 100 || hourlySessions >= 20) return { ok: false as const, code: "rejected" as const };
    const next = { key: "demo" as const, sessions: (budget?.sessions ?? 0) + 1, groups: budget?.groups ?? 0, hour, hourlySessions: hourlySessions + 1 };
    if (budget) await ctx.db.patch(budget._id, next);
    else await ctx.db.insert("demoOnboardingBudget", next);
    const expiresAt = Date.now() + LINK_LIFETIME_MS;
    await ctx.db.insert("demoOnboardingSessions", { sessionHash, expiresAt, failedJoins: 0 });
    return { ok: true as const, expiresAt };
  },
});

export const complete = internalMutation({
  args: { sessionHash: v.string(), payloadHash: v.string(), linkHash: v.string(), viewerToken: v.string(), payload },
  returns: v.union(error, v.object({ ok: v.literal(true), joinCode: v.string(), linkExpiresAt: v.number() })),
  handler: async (ctx, args) => {
    const status = await onboardingStatus(ctx);
    if (!status.enabled) return { ok: false as const, code: status.reason };
    const config = configuredTransport()!;
    if (![args.sessionHash, args.payloadHash, args.linkHash].every((value) => /^[0-9a-f]{64}$/.test(value)) || !/^[A-Za-z0-9_-]{43}$/.test(args.viewerToken)) return { ok: false as const, code: "rejected" as const };
    const session = await ctx.db.query("demoOnboardingSessions").withIndex("by_session_hash", (q) => q.eq("sessionHash", args.sessionHash)).unique();
    if (!session || session.expiresAt <= Date.now()) return { ok: false as const, code: "rejected" as const };
    const p = args.payload;
    if (!p.playerName || p.playerName !== p.playerName.trim() || p.playerName.length > 64 ||
      (p.kind === "create" && (!p.groupName || p.groupName !== p.groupName.trim() || p.groupName.length > 64)) ||
      (p.kind === "join" && !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(p.joinCode))) return { ok: false as const, code: "rejected" as const };
    if (session.payloadHash) {
      if (session.payloadHash !== args.payloadHash || !session.groupId || !session.playerId || !session.linkId || !session.viewerId) return { ok: false as const, code: "rejected" as const };
      const [group, player, link, viewer] = await Promise.all([ctx.db.get(session.groupId), ctx.db.get(session.playerId), ctx.db.get(session.linkId), ctx.db.get(session.viewerId)]);
      if (!group || !group.demoOnboarding || group.caseId !== status.caseId || !player || player.groupId !== group._id || !link || link.tokenHash !== args.linkHash || link.playerId !== player._id || link.groupId !== group._id ||
          !viewer || viewer.token !== args.viewerToken || viewer.playerId !== player._id || viewer.groupId !== group._id) return { ok: false as const, code: "rejected" as const };
      return { ok: true as const, joinCode: group.joinCode, linkExpiresAt: link.expiresAt };
    }
    if (session.failedJoins >= 5 || await ctx.db.query("pendingPlayerLinks").withIndex("by_token_hash", (q) => q.eq("tokenHash", args.linkHash)).first() ||
        await ctx.db.query("viewerTokens").withIndex("by_token", (q) => q.eq("token", args.viewerToken)).first()) return { ok: false as const, code: "rejected" as const };
    let groupId;
    let playerId;
    let joinCode;
    if (p.kind === "create") {
      const budget = await ctx.db.query("demoOnboardingBudget").withIndex("by_key", (q) => q.eq("key", "demo")).unique();
      if (!budget || budget.groups >= 20) return { ok: false as const, code: "rejected" as const };
      for (let i = 0; i < 20; i++) {
        const candidate = makeCode();
        if (!await ctx.db.query("groups").withIndex("by_joinCode", (q) => q.eq("joinCode", candidate)).first()) { joinCode = candidate; break; }
      }
      if (!joinCode) return { ok: false as const, code: "rejected" as const };
      groupId = await ctx.db.insert("groups", { name: p.groupName, joinCode, caseId: status.caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0, demoOnboarding: true });
      playerId = await ctx.db.insert("players", { groupId, name: p.playerName, joinedDay: 0, lateJoiner: false });
      await ctx.db.patch(groupId, { hostId: playerId });
      await ctx.db.patch(budget._id, { groups: budget.groups + 1 });
    } else {
      const groups = await ctx.db.query("groups").withIndex("by_joinCode", (q) => q.eq("joinCode", p.joinCode)).take(2);
      const candidate = groups.length === 1 ? groups[0] : null;
      if (!candidate || !candidate.demoOnboarding || candidate.caseId !== status.caseId || candidate.status === "solved") {
        await ctx.db.patch(session._id, { failedJoins: session.failedJoins + 1 });
        return { ok: false as const, code: "rejected" as const };
      }
      const group = await currentGroup(ctx, candidate);
      if (group.status === "solved" || (await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", group._id)).take(MAX_PLAYERS)).length >= MAX_PLAYERS) {
        await ctx.db.patch(session._id, { failedJoins: session.failedJoins + 1 });
        return { ok: false as const, code: "rejected" as const };
      }
      groupId = group._id;
      joinCode = group.joinCode;
      playerId = await ctx.db.insert("players", { groupId, name: p.playerName, joinedDay: group.day, lateJoiner: group.status === "active" });
    }
    const linkId = await ctx.db.insert("pendingPlayerLinks", { tokenHash: args.linkHash, groupId, playerId, agentId: config.agentId, botId: config.botId, lineId: "1", expiresAt: session.expiresAt });
    const viewerId = await ctx.db.insert("viewerTokens", { token: args.viewerToken, groupId, playerId, expiresAt: Date.now() + 14 * 86400000 });
    await ctx.db.patch(session._id, { payloadHash: args.payloadHash, groupId, playerId, linkId, viewerId });
    return { ok: true as const, joinCode, linkExpiresAt: session.expiresAt };
  },
});
