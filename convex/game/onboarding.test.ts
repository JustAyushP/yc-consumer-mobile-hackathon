/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { hashText } from "./playerLinkShared";

type Failure = { ok: false; code: string };
type Session = { ok: true; session: string; expiresAt: number };
type Onboarded = { ok: true; joinCode: string; viewerToken: string; telegramUrl: string; linkExpiresAt: number };
type Transport = { agentId: string; botId: string; conversationId: string; senderId: string };
const availability = makeFunctionReference<"query", Record<string, never>, { enabled: boolean; reason?: string }>("game/onboarding:availability");
const begin = makeFunctionReference<"action", Record<string, never>, Session | Failure>("game/onboarding:begin");
const create = makeFunctionReference<"action", { session: string; groupName: string; playerName: string }, Onboarded | Failure>("game/onboarding:create");
const join = makeFunctionReference<"action", { session: string; joinCode: string; playerName: string }, Onboarded | Failure>("game/onboarding:join");
const mint = makeFunctionReference<"action", { groupId: Id<"groups">; playerId: Id<"players"> }, { ok: true; telegramUrl: string; linkExpiresAt: number } | Failure>("game/playerLinks:mint");
const redeemDemo = makeFunctionReference<"action", Transport & { startToken: string }, { ok: true; status: "linked" } | Failure>("game/playerLinks:redeemDemo");
const redeemVerified = makeFunctionReference<"action", Transport & { startToken: string }, { ok: true; status: "linked" } | Failure>("game/playerLinks:redeemVerified");
const install = makeFunctionReference<"mutation", Record<string, never>, Id<"cases">>("cases/installSf:installIsolatedSf");
const claim = makeFunctionReference<"mutation", Omit<Transport, "botId"> & { channel: string; lineId: string; eventKey: string; body: string }, { status: string }>("chat/keikiIngress:claim");
const viewer = makeFunctionReference<"query", { viewerToken: string }, { group: { name: string } }>("game/viewer:me");
const botId = "1234567";
const transport = (senderId: string): Transport => ({ agentId: "agent-test", botId, senderId, conversationId: JSON.stringify(["telegram", botId, senderId]) });
const token = (url: string) => new URL(url).searchParams.get("start")!;

beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("RAVO_ONBOARDING_ENABLED", "false"); vi.stubEnv("RAVO_PLAYER_LINK_SAFE_HANDOFF_READY", "false"); vi.stubEnv("RAVO_PLAYER_LINK_VERIFIED_ENABLED", "false"); vi.stubEnv("RAVO_PLAYER_LINK_DEMO_ENABLED", "false"); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function setup() {
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  const caseId = await t.mutation(install, {});
  vi.stubEnv("KEIKI_DEMO_AGENT_ID", "agent-test");
  vi.stubEnv("KEIKI_DEMO_TELEGRAM_BOT_ID", botId);
  vi.stubEnv("KEIKI_DEMO_LINE_ID", "1");
  vi.stubEnv("RAVO_ONBOARDING_HMAC_SECRET", "synthetic-test-secret-not-production-0123456789");
  return { t, caseId };
}

function enable() { vi.stubEnv("RAVO_ONBOARDING_ENABLED", "true"); vi.stubEnv("RAVO_PLAYER_LINK_SAFE_HANDOFF_READY", "true"); }
async function session(t: ReturnType<typeof convexTest<typeof schema.tables>>) {
  const value = await t.action(begin, {});
  if (!value.ok) throw new Error(`begin failed: ${value.code}`);
  return value;
}
async function team(t: ReturnType<typeof convexTest<typeof schema.tables>>) {
  const s = await session(t);
  const value = await t.action(create, { session: s.session, groupName: "Night Shift", playerName: "Detective" });
  if (!value.ok) throw new Error(`create failed: ${value.code}`);
  return { ...value, session: s.session };
}

describe("demo onboarding and player links", () => {
  it("fails closed until the explicit safe handoff and configuration exist", async () => {
    const { t } = await setup();
    expect(await t.query(availability, {})).toEqual({ enabled: false, reason: "disabled" });
    expect(await t.action(begin, {})).toEqual({ ok: false, code: "disabled" });
    vi.stubEnv("RAVO_ONBOARDING_ENABLED", "true");
    expect(await t.query(availability, {})).toEqual({ enabled: false, reason: "unconfigured" });
    expect(await t.action(begin, {})).toEqual({ ok: false, code: "unconfigured" });
    expect(await t.run(async (ctx) => ctx.db.query("demoOnboardingSessions").collect())).toEqual([]);
    enable();
    expect(await t.query(availability, {})).toEqual({ enabled: true });
    vi.stubEnv("KEIKI_DEMO_LINE_ID", "2");
    expect(await t.query(availability, {})).toEqual({ enabled: false, reason: "unconfigured" });
  });

  it("returns the same capabilities for exact retries and rejects conflicting concurrent requests", async () => {
    const { t } = await setup(); enable();
    const s = await session(t);
    const args = { session: s.session, groupName: " Night Shift ", playerName: " Detective " };
    const [first, retry] = await Promise.all([t.action(create, args), t.action(create, { ...args, groupName: "Night Shift", playerName: "Detective" })]);
    expect(first.ok).toBe(true);
    expect(retry).toEqual(first);
    if (!first.ok) throw new Error("create failed");
    expect(await t.action(create, { ...args, groupName: "Different" })).toEqual({ ok: false, code: "rejected" });
    expect(await t.action(join, { session: s.session, joinCode: first.joinCode, playerName: "Detective" })).toEqual({ ok: false, code: "rejected" });
    const data = await t.run(async (ctx) => ({ groups: await ctx.db.query("groups").collect(), players: await ctx.db.query("players").collect(), links: await ctx.db.query("pendingPlayerLinks").collect(), sessions: await ctx.db.query("demoOnboardingSessions").collect() }));
    expect(data.groups).toHaveLength(1); expect(data.players).toHaveLength(1); expect(data.links).toHaveLength(1);
    expect(data.groups[0]).toMatchObject({ demoOnboarding: true, status: "lobby" });
    expect(data.links[0].tokenHash).toBe(await hashText(token(first.telegramUrl)));
    expect(JSON.stringify(data.links)).not.toContain(token(first.telegramUrl));
    expect(JSON.stringify(data.sessions)).not.toContain(s.session);
    expect((await t.query(viewer, { viewerToken: first.viewerToken })).group.name).toBe("Night Shift");
    const s2 = await session(t);
    const joined = await t.action(join, { session: s2.session, joinCode: first.joinCode.toLowerCase(), playerName: "Friend" });
    expect(joined.ok).toBe(true);
    if (joined.ok) expect(await t.action(join, { session: s2.session, joinCode: first.joinCode, playerName: "Friend" })).toEqual(joined);
    expect(await t.run(async (ctx) => (await ctx.db.query("players").collect()).length)).toBe(2);
  });

  it("refuses legacy groups, bounds join guesses, and expires sessions at the boundary", async () => {
    const { t, caseId } = await setup(); enable();
    await t.run(async (ctx) => ctx.db.insert("groups", { name: "Old", joinCode: "AAAAA", caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0 }));
    const target = await team(t);
    const s = await session(t);
    for (let i = 0; i < 5; i++) expect(await t.action(join, { session: s.session, joinCode: "AAAAA", playerName: "Guest" })).toEqual({ ok: false, code: "rejected" });
    expect(await t.action(join, { session: s.session, joinCode: target.joinCode, playerName: "Guest" })).toEqual({ ok: false, code: "rejected" });
    const expiring = await session(t);
    vi.setSystemTime(expiring.expiresAt);
    expect(await t.action(create, { session: expiring.session, groupName: "Too Late", playerName: "Guest" })).toEqual({ ok: false, code: "rejected" });
    expect(await t.run(async (ctx) => (await ctx.db.query("groups").collect()).length)).toBe(2);
  });

  it("gates redemption, binds exactly once, and preserves existing ingress behavior", async () => {
    const { t } = await setup(); enable();
    const teamResult = await team(t);
    const startToken = token(teamResult.telegramUrl);
    const request = { ...transport("tg:tester"), startToken };
    expect(await t.action(redeemVerified, request)).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await t.action(redeemDemo, request)).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    vi.stubEnv("RAVO_PLAYER_LINK_DEMO_ENABLED", "true");
    expect(await t.action(redeemDemo, { ...request, agentId: "forged" })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await t.action(redeemDemo, { ...request, botId: "999" })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await t.action(redeemDemo, { ...request, conversationId: "not-private-tuple" })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    const [a, b] = await Promise.all([t.action(redeemDemo, request), t.action(redeemDemo, request)]);
    expect([a, b].filter((item) => item.ok)).toHaveLength(1);
    expect(await t.action(redeemDemo, { ...transport("tg:other"), startToken })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    const { botId: _, ...claimTransport } = transport("tg:tester");
    expect((await t.mutation(claim, { ...claimTransport, channel: "telegram", lineId: "1", eventKey: "new-event", body: "hello" })).status).toBe("claimed");
    expect((await t.mutation(claim, { ...claimTransport, senderId: "tg:other", channel: "telegram", lineId: "1", eventKey: "other-event", body: "hello" })).status).toBe("rejected");
    expect(await t.run(async (ctx) => (await ctx.db.query("keikiBindings").collect()).length)).toBe(1);
  });

  it("does not replace inactive transports or bind a moved player", async () => {
    const { t, caseId } = await setup(); enable(); vi.stubEnv("RAVO_PLAYER_LINK_DEMO_ENABLED", "true");
    const first = await team(t);
    const old = await t.run(async (ctx) => {
      const player = (await ctx.db.query("players").first())!;
      const other = await ctx.db.insert("groups", { name: "Old", joinCode: "BBBBB", caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0 });
      const { botId: _, ...existingTransport } = transport("tg:used");
      await ctx.db.insert("keikiBindings", { ...existingTransport, channel: "telegram", lineId: "1", groupId: player.groupId, playerId: player._id, active: false });
      return { playerId: player._id, groupId: player.groupId, other };
    });
    const request = { ...transport("tg:used"), startToken: token(first.telegramUrl) };
    expect(await t.action(redeemDemo, request)).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect((await t.run(async (ctx) => ctx.db.query("pendingPlayerLinks").first()))?.consumedAt).toBeUndefined();
    await t.run(async (ctx) => ctx.db.patch(old.playerId, { groupId: old.other }));
    expect(await t.action(redeemDemo, { ...transport("tg:new"), startToken: token(first.telegramUrl) })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await t.action(mint, { groupId: old.groupId, playerId: old.playerId })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
  });

  it("prevents two distinct tokens from claiming one player or one transport", async () => {
    const { t } = await setup(); enable(); vi.stubEnv("RAVO_PLAYER_LINK_VERIFIED_ENABLED", "true");
    const first = await team(t);
    const ids = await t.run(async (ctx) => {
      const player = (await ctx.db.query("players").first())!;
      return { groupId: player.groupId, playerId: player._id };
    });
    const extra = await t.action(mint, ids);
    expect(extra.ok).toBe(true);
    if (!extra.ok) throw new Error("mint failed");
    const [a, b] = await Promise.all([
      t.action(redeemVerified, { ...transport("tg:first"), startToken: token(first.telegramUrl) }),
      t.action(redeemVerified, { ...transport("tg:second"), startToken: token(extra.telegramUrl) }),
    ]);
    expect([a, b].filter((item) => item.ok)).toHaveLength(1);
    expect((await t.action(mint, ids)).ok).toBe(false);
    const otherSession = await session(t);
    const other = await t.action(join, { session: otherSession.session, joinCode: first.joinCode, playerName: "Another" });
    if (!other.ok) throw new Error("join failed");
    const linked = await t.run(async (ctx) => (await ctx.db.query("keikiBindings").first())!);
    expect(await t.action(redeemVerified, { ...transport(linked.senderId), startToken: token(other.telegramUrl) })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await t.run(async (ctx) => (await ctx.db.query("keikiBindings").collect()).length)).toBe(1);
    const otherHash = await hashText(token(other.telegramUrl));
    const otherLink = await t.run(async (ctx) => ctx.db.query("pendingPlayerLinks").withIndex("by_token_hash", (q) => q.eq("tokenHash", otherHash)).first());
    expect(otherLink?.consumedAt).toBeUndefined();
    expect((await t.action(redeemVerified, { ...transport("tg:third"), startToken: token(other.telegramUrl) })).ok).toBe(true);
  });

  it("rejects expired or solved links without consuming them", async () => {
    const { t } = await setup(); enable(); vi.stubEnv("RAVO_PLAYER_LINK_DEMO_ENABLED", "true");
    const first = await team(t);
    const ids = await t.run(async (ctx) => {
      const player = (await ctx.db.query("players").first())!;
      return { groupId: player.groupId, playerId: player._id };
    });
    await t.run(async (ctx) => ctx.db.patch(ids.groupId, { status: "solved" }));
    expect(await t.action(redeemDemo, { ...transport("tg:test"), startToken: token(first.telegramUrl) })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect((await t.run(async (ctx) => ctx.db.query("pendingPlayerLinks").first()))?.consumedAt).toBeUndefined();
    await t.run(async (ctx) => ctx.db.patch(ids.groupId, { status: "lobby" }));
    vi.setSystemTime(first.linkExpiresAt);
    expect(await t.action(redeemDemo, { ...transport("tg:test"), startToken: token(first.telegramUrl) })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await t.run(async (ctx) => (await ctx.db.query("keikiBindings").collect()).length)).toBe(0);
  });

  it("caps demo sessions and group membership", async () => {
    const { t } = await setup(); enable();
    const first = await team(t);
    for (let i = 0; i < 5; i++) {
      const s = await session(t);
      expect((await t.action(join, { session: s.session, joinCode: first.joinCode, playerName: `Guest ${i}` })).ok).toBe(true);
    }
    const extra = await session(t);
    expect(await t.action(join, { session: extra.session, joinCode: first.joinCode, playerName: "Overflow" })).toEqual({ ok: false, code: "rejected" });
    for (let i = 0; i < 13; i++) await session(t);
    expect(await t.action(begin, {})).toEqual({ ok: false, code: "rejected" });
    expect(await t.run(async (ctx) => (await ctx.db.query("players").collect()).length)).toBe(6);
  });
});
