import type { QueryCtx } from "../_generated/server";
import { verifiedSfCase } from "./integration/sf";

export const LINK_LIFETIME_MS = 15 * 60 * 1000;
export const SAL_BOT = "ravo_sal_demo_bot";

export function configuredTransport() {
  const agentId = process.env.KEIKI_DEMO_AGENT_ID;
  const botId = process.env.KEIKI_DEMO_TELEGRAM_BOT_ID;
  const secret = process.env.RAVO_ONBOARDING_HMAC_SECRET;
  if (!agentId || agentId !== agentId.trim() || agentId.length > 256 || !botId || !/^\d{1,20}$/.test(botId) ||
      process.env.KEIKI_DEMO_LINE_ID !== "1" || !secret || secret.length < 32 || secret.length > 512) return null;
  return { agentId, botId, secret };
}

export async function onboardingStatus(ctx: QueryCtx) {
  if (process.env.RAVO_ONBOARDING_ENABLED !== "true") return { enabled: false as const, reason: "disabled" as const };
  if (process.env.RAVO_PLAYER_LINK_SAFE_HANDOFF_READY !== "true" || process.env.RAVO_PLAYER_LINK_VERIFIED_ENABLED !== "true" || !configuredTransport()) return { enabled: false as const, reason: "unconfigured" as const };
  const cases = await ctx.db.query("cases").withIndex("by_key", (q) => q.eq("key", "velvet-lantern")).take(2);
  if (cases.length !== 1 || !await verifiedSfCase(ctx, cases[0]._id)) return { enabled: false as const, reason: "unconfigured" as const };
  return { enabled: true as const, caseId: cases[0]._id };
}

export function encodeBase64Url(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomCapability() {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashText(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deriveCapability(secret: string, purpose: string, session: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${purpose}:${session}`))));
}
