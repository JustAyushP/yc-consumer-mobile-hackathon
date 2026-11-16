import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { action, query, type ActionCtx } from "../_generated/server";
import { configuredTransport, deriveCapability, hashText, onboardingStatus, randomCapability, SAL_BOT } from "./playerLinkShared";

const failure = v.object({ ok: v.literal(false), code: v.union(v.literal("disabled"), v.literal("unconfigured"), v.literal("rejected"), v.literal("retry_later")) });
const result = v.union(failure, v.object({ ok: v.literal(true), joinCode: v.string(), viewerToken: v.string(), telegramUrl: v.string(), linkExpiresAt: v.number() }));
const availabilityRef = makeFunctionReference<"query", Record<string, never>, { enabled: boolean; reason?: "disabled" | "unconfigured" }>("game/onboarding:availability");
const beginRef = makeFunctionReference<"mutation", { sessionHash: string }, { ok: false; code: "disabled" | "unconfigured" | "rejected" } | { ok: true; expiresAt: number }>("game/onboardingStore:begin");
type Payload = { kind: "create"; groupName: string; playerName: string } | { kind: "join"; joinCode: string; playerName: string };
const completeRef = makeFunctionReference<"mutation", { sessionHash: string; payloadHash: string; linkHash: string; viewerToken: string; payload: Payload }, { ok: false; code: "disabled" | "unconfigured" | "rejected" } | { ok: true; joinCode: string; linkExpiresAt: number }>("game/onboardingStore:complete");

export const availability = query({
  args: {},
  returns: v.object({ enabled: v.boolean(), reason: v.optional(v.union(v.literal("disabled"), v.literal("unconfigured"))) }),
  handler: async (ctx) => {
    const status = await onboardingStatus(ctx);
    return status.enabled ? { enabled: true } : status;
  },
});

export const begin = action({
  args: {},
  returns: v.union(failure, v.object({ ok: v.literal(true), session: v.string(), expiresAt: v.number() })),
  handler: async (ctx) => {
    try {
      const status = await ctx.runQuery(availabilityRef, {});
      if (!status.enabled) return { ok: false as const, code: status.reason ?? "unconfigured" };
      const session = randomCapability();
      const stored = await ctx.runMutation(beginRef, { sessionHash: await hashText(session) });
      return stored.ok ? { ok: true as const, session, expiresAt: stored.expiresAt } : stored;
    } catch {
      return { ok: false as const, code: "retry_later" as const };
    }
  },
});

async function complete(ctx: ActionCtx, session: string, payload: Payload) {
  try {
    const status = await ctx.runQuery(availabilityRef, {});
    if (!status.enabled) return { ok: false as const, code: status.reason ?? "unconfigured" };
    if (!/^[A-Za-z0-9_-]{43}$/.test(session) || !payload.playerName || payload.playerName.length > 64 ||
        (payload.kind === "create" && (!payload.groupName || payload.groupName.length > 64)) ||
        (payload.kind === "join" && !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(payload.joinCode))) return { ok: false as const, code: "rejected" as const };
    const config = configuredTransport();
    if (!config) return { ok: false as const, code: "unconfigured" as const };
    const [sessionHash, payloadHash, link, viewerToken] = await Promise.all([
      hashText(session), hashText(JSON.stringify(payload)), deriveCapability(config.secret, "player-link-v1", session), deriveCapability(config.secret, "viewer-v1", session),
    ]);
    const startToken = `p_${link}`;
    const stored = await ctx.runMutation(completeRef, { sessionHash, payloadHash, linkHash: await hashText(startToken), viewerToken, payload });
    return stored.ok ? { ok: true as const, joinCode: stored.joinCode, viewerToken, telegramUrl: `https://t.me/${SAL_BOT}?start=${startToken}`, linkExpiresAt: stored.linkExpiresAt } : stored;
  } catch {
    return { ok: false as const, code: "retry_later" as const };
  }
}

export const create = action({
  args: { session: v.string(), groupName: v.string(), playerName: v.string() },
  returns: result,
  handler: async (ctx, args) => await complete(ctx, args.session, { kind: "create", groupName: args.groupName.trim(), playerName: args.playerName.trim() }),
});

export const join = action({
  args: { session: v.string(), joinCode: v.string(), playerName: v.string() },
  returns: result,
  handler: async (ctx, args) => await complete(ctx, args.session, { kind: "join", joinCode: args.joinCode.trim().toUpperCase(), playerName: args.playerName.trim() }),
});
