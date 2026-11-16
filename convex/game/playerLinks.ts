import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { hashText, randomCapability, SAL_BOT } from "./playerLinkShared";

type LinkResult = { ok: false; code: "LINK_UNAVAILABLE" } | { ok: true; status: "linked" };
type Transport = { agentId: string; botId: string; conversationId: string; senderId: string };
const failure = v.object({ ok: v.literal(false), code: v.literal("LINK_UNAVAILABLE") });
const transport = { agentId: v.string(), botId: v.string(), conversationId: v.string(), senderId: v.string() };
const mintRef = makeFunctionReference<"mutation", { groupId: Id<"groups">; playerId: Id<"players">; tokenHash: string }, { ok: false; code: "LINK_UNAVAILABLE" } | { ok: true; linkExpiresAt: number }>("game/playerLinkStore:mint");
const redeemRef = makeFunctionReference<"mutation", Transport & { tokenHash: string; mode: "verified" | "demo" }, LinkResult>("game/playerLinkStore:redeem");

export const mint = internalAction({
  args: { groupId: v.id("groups"), playerId: v.id("players") },
  returns: v.union(failure, v.object({ ok: v.literal(true), telegramUrl: v.string(), linkExpiresAt: v.number() })),
  handler: async (ctx, args) => {
    try {
      const startToken = `p_${randomCapability()}`;
      const stored = await ctx.runMutation(mintRef, { ...args, tokenHash: await hashText(startToken) });
      return stored.ok ? { ok: true as const, telegramUrl: `https://t.me/${SAL_BOT}?start=${startToken}`, linkExpiresAt: stored.linkExpiresAt } : stored;
    } catch {
      return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    }
  },
});

export const redeemVerified = internalAction({
  args: { startToken: v.string(), ...transport },
  returns: v.union(failure, v.object({ ok: v.literal(true), status: v.literal("linked") })),
  handler: async (ctx, { startToken, ...args }) => {
    if (!/^p_[A-Za-z0-9_-]{43}$/.test(startToken)) return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    try { return await ctx.runMutation(redeemRef, { ...args, tokenHash: await hashText(startToken), mode: "verified" }); }
    catch { return { ok: false as const, code: "LINK_UNAVAILABLE" as const }; }
  },
});

export const redeemDemo = internalAction({
  args: { startToken: v.string(), ...transport },
  returns: v.union(failure, v.object({ ok: v.literal(true), status: v.literal("linked") })),
  handler: async (ctx, { startToken, ...args }) => {
    if (!/^p_[A-Za-z0-9_-]{43}$/.test(startToken)) return { ok: false as const, code: "LINK_UNAVAILABLE" as const };
    try { return await ctx.runMutation(redeemRef, { ...args, tokenHash: await hashText(startToken), mode: "demo" }); }
    catch { return { ok: false as const, code: "LINK_UNAVAILABLE" as const }; }
  },
});
