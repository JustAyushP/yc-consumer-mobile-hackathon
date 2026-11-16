/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";

const availability = makeFunctionReference<"query", Record<string, never>, { enabled: boolean; reason?: string }>("game/onboarding:availability");
const begin = makeFunctionReference<"action", Record<string, never>, unknown>("game/onboarding:begin");
const create = makeFunctionReference<"action", { session: string; groupName: string; playerName: string }, unknown>("game/onboarding:create");
const join = makeFunctionReference<"action", { session: string; joinCode: string; playerName: string }, unknown>("game/onboarding:join");
const mint = makeFunctionReference<"action", { groupId: string; playerId: string }, unknown>("game/playerLinks:mint");
type Redemption = { startToken: string; agentId: string; botId: string; conversationId: string; senderId: string };
const verified = makeFunctionReference<"action", Redemption, unknown>("game/playerLinks:redeemVerified");
const demo = makeFunctionReference<"action", Redemption, unknown>("game/playerLinks:redeemDemo");
const fixtureToken = `p_${"A".repeat(43)}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  for (const key of ["RAVO_ONBOARDING_ENABLED", "RAVO_PLAYER_LINK_SAFE_HANDOFF_READY", "RAVO_PLAYER_LINK_VERIFIED_ENABLED", "RAVO_PLAYER_LINK_DEMO_ENABLED"]) vi.stubEnv(key, undefined);
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  const fixture = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "fixture-link-entry", title: "Fixture", setting: "Fixture", victim: "Fixture", logline: "Fixture", culpritKey: "fixture", reveal: [] });
    const groupId = await ctx.db.insert("groups", { name: "Fixture", joinCode: "ABCDE", caseId, status: "lobby", day: 0, progress: 0, wrongAccusations: 0 });
    const playerId = await ctx.db.insert("players", { name: "Fixture", groupId, joinedDay: 0, lateJoiner: false });
    const transport = { agentId: "fixture-agent", channel: "telegram", conversationId: JSON.stringify(["telegram", "123", "fixture-sender"]), senderId: "fixture-sender", lineId: "1" };
    await ctx.db.insert("keikiBindings", { ...transport, playerId, groupId, active: true });
    return { playerId, groupId, ...transport, botId: "123" };
  });
  const snapshot = () => t.run(async (ctx) => ({
    bindings: await ctx.db.query("keikiBindings").collect(),
    links: await ctx.db.query("pendingPlayerLinks").collect(),
    messages: await ctx.db.query("messages").collect(),
    receipts: await ctx.db.query("keikiReceipts").collect(),
    groups: await ctx.db.query("groups").collect(),
    players: await ctx.db.query("players").collect(),
    viewers: await ctx.db.query("viewerTokens").collect(),
  }));
  return { t, fixture, snapshot };
}

describe("disabled player-link entry against unpublished Brain d7657c7 (offline only)", () => {
  it("keeps public onboarding unavailable without a safe handoff", async () => {
    const { t, snapshot } = await setup();
    const before = await snapshot();
    expect(await t.query(availability, {})).toEqual({ enabled: false, reason: "disabled" });
    expect(await t.action(begin, {})).toEqual({ ok: false, code: "disabled" });
    expect(await t.action(create, { session: "A".repeat(43), groupName: "Fixture", playerName: "Fixture" })).toEqual({ ok: false, code: "disabled" });
    expect(await t.action(join, { session: "A".repeat(43), joinCode: "ABCDE", playerName: "Fixture" })).toEqual({ ok: false, code: "disabled" });
    expect(await snapshot()).toEqual(before);
  });

  it("fails closed for mint and both redemption actions without replacing the prebound fixture", async () => {
    const { t, fixture, snapshot } = await setup();
    const before = await snapshot();
    expect(await t.action(mint, { groupId: fixture.groupId, playerId: fixture.playerId })).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    const args = { startToken: fixtureToken, agentId: fixture.agentId, botId: fixture.botId, conversationId: fixture.conversationId, senderId: fixture.senderId };
    expect(await t.action(verified, args)).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await t.action(demo, args)).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await snapshot()).toEqual(before);
  });

  it("leaves the pre-model HTTP entry disabled, without logging or consuming a start token", async () => {
    const { t, snapshot } = await setup();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const before = await snapshot();
    const response = await t.fetch("/keiki/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `/start ${fixtureToken}`, senderId: "unverified-sender" }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Keiki external harness is disabled" });
    expect(log).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });

  it("does not redeem or persist model-generated start prose for an unbound sender", async () => {
    const { t, fixture, snapshot } = await setup();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("KEIKI_DEMO_INGRESS_ENABLED", "true");
    vi.stubEnv("KEIKI_DEMO_AGENT_ID", fixture.agentId);
    vi.stubEnv("KEIKI_DEMO_LINE_ID", "1");
    vi.stubEnv("KEIKI_DEMO_TELEGRAM_BOT_ID", fixture.botId);
    const before = await snapshot();
    const response = await t.fetch("/keiki/consult?lineId=1&botId=123", { method: "POST", headers: { "Content-Type": "application/json", "X-Orchid-Trace-Id": "fixture-unbound-start" }, body: JSON.stringify({ input: { playerMessage: `/start ${fixtureToken}`, summary: "Fixture", intent: "join" }, context: { phone: "unbound-sender" } }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Unknown or invalid binding" });
    expect(log).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });
});
