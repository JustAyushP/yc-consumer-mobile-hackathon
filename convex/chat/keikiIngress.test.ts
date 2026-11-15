/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { handleConsult, type DemoConfig, type Dependencies } from "./keikiHandler";

const config: DemoConfig = { enabled: "true", apiKey: "fixture-tool-key", agentId: "demo-agent", lineId: "1" };
const payload = {
  input: { playerMessage: "  My exact question.\n", summary: "A question", intent: "question" },
  context: { phone: "+15550000001", channel: "imessage" },
};

afterEach(() => vi.unstubAllEnvs());

function request(body: unknown = payload, headers: Record<string, string | null> = {}, query = "?lineId=1") {
  const values = new Headers({ "content-type": "application/json", "X-Orchid-Api-Key": "fixture-tool-key", "X-Orchid-Trace-Id": "demo-trace" });
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) values.delete(key);
    else values.set(key, value);
  }
  return new Request(`https://example.test/keiki/consult${query}`, { method: "POST", headers: values, body: JSON.stringify(body) });
}

async function setup() {
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  const ids = await t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", { key: "demo", title: "Case", setting: "Bar", victim: "Victim", logline: "Case", culpritKey: "culprit", reveal: ["Solution"] });
    const groupId = await ctx.db.insert("groups", { name: "Demo", joinCode: "DEMO", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const otherGroupId = await ctx.db.insert("groups", { name: "Other", joinCode: "OTHER", caseId, status: "active", day: 1, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const playerId = await ctx.db.insert("players", { groupId, name: "One", joinedDay: 1, lateJoiner: false });
    const secondPlayerId = await ctx.db.insert("players", { groupId, name: "Two", joinedDay: 1, lateJoiner: false });
    const binding = { agentId: "demo-agent", channel: "imessage", conversationId: payload.context.phone, senderId: payload.context.phone, lineId: "1", groupId, playerId, active: true };
    const bindingId = await ctx.db.insert("keikiBindings", binding);
    const secondBindingId = await ctx.db.insert("keikiBindings", { ...binding, conversationId: "+15550000002", senderId: "+15550000002", playerId: secondPlayerId });
    return { caseId, groupId, otherGroupId, playerId, secondPlayerId, bindingId, secondBindingId };
  });
  const consult = vi.fn<Dependencies["consult"]>(async ({ playerId }) => ({ character: { agentKey: "common", name: "Fixture actor" }, guidance: `Private fixture for ${playerId}` }));
  const deps: Dependencies = {
    claim: (args) => t.mutation(internal.chat.keikiIngress.claim, args),
    consult,
    complete: (receiptId, directiveJson) => t.mutation(internal.chat.keikiIngress.complete, { receiptId, directiveJson }),
    uncertain: (receiptId) => t.mutation(internal.chat.keikiIngress.uncertain, { receiptId }),
  };
  const send = (req = request(), env = config) => handleConsult(req, env, deps);
  const state = () => t.run(async (ctx) => ({
    messages: await ctx.db.query("messages").collect(),
    receipts: await ctx.db.query("keikiReceipts").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  return { t, ...ids, deps, consult, send, state };
}

describe("demo ingress with fake hosted transport and fake master", () => {
  it.each([undefined, "", "false", "TRUE"])("fails closed with enabled=%s", async (enabled) => {
    const { send, state, consult } = await setup();
    expect((await send(request(), { ...config, enabled })).status).toBe(503);
    expect((await state()).messages).toHaveLength(0);
    expect(consult).not.toHaveBeenCalled();
  });

  it.each(["apiKey", "agentId", "lineId"] as const)("fails closed without %s", async (key) => {
    const { send } = await setup();
    expect((await send(request(), { ...config, [key]: undefined })).status).toBe(503);
  });

  it.each([null, "wrong", "fixture-tool-key-longer"])("rejects invalid legacy auth %s", async (key) => {
    const { send, state, consult } = await setup();
    expect((await send(request(payload, { "X-Orchid-Api-Key": key }))).status).toBe(401);
    expect((await state()).messages).toHaveLength(0);
    expect(consult).not.toHaveBeenCalled();
  });

  it.each(["", "?lineId=2", "?lineId=1&lineId=1", "?lineId=1&agentId=other"])("rejects route %s", async (query) => {
    const { send, state } = await setup();
    expect((await send(request(payload, {}, query))).status).toBe(400);
    expect((await state()).messages).toHaveLength(0);
  });

  it.each([null, " ", "x".repeat(257)])("requires a bounded demo trace", async (trace) => {
    const { send } = await setup();
    expect((await send(request(payload, { "X-Orchid-Trace-Id": trace }))).status).toBe(400);
  });

  it.each(["true", "false"])("rejects dashboard header even when %s", async (internal) => {
    const { send, consult } = await setup();
    expect((await send(request(payload, { "X-Orchid-Internal": internal }))).status).toBe(403);
    expect(consult).not.toHaveBeenCalled();
  });

  it.each([true, false])("rejects dashboard context even when %s", async (internal) => {
    const { send } = await setup();
    expect((await send(request({ ...payload, context: { ...payload.context, internal } }))).status).toBe(403);
  });

  it.each(["groupId", "playerId", "lineId", "agentKey", "agentId", "messageId", "phone", "conversationId", "senderId"])("rejects model-selected %s", async (key) => {
    const { send, state } = await setup();
    expect((await send(request({ ...payload, input: { ...payload.input, [key]: "attacker-choice" } }))).status).toBe(400);
    expect((await state()).messages).toHaveLength(0);
  });

  it.each([
    { ...payload, playerId: "other" },
    { ...payload, context: { ...payload.context, senderId: "other" } },
    { ...payload, context: { phone: "", channel: "imessage" } },
    { ...payload, context: { phone: "x".repeat(257), channel: "imessage" } },
    { ...payload, context: { ...payload.context, channel: "x".repeat(65) } },
    { ...payload, input: { ...payload.input, playerMessage: " " } },
    { ...payload, input: { ...payload.input, playerMessage: "x".repeat(8001) } },
    { ...payload, input: { ...payload.input, summary: "x".repeat(1001) } },
    { ...payload, input: { ...payload.input, summary: undefined } },
    { ...payload, input: { ...payload.input, intent: undefined } },
    { ...payload, input: { ...payload.input, intent: "hint" } },
  ])("rejects malformed or excessive input %#", async (body) => {
    const { send, state } = await setup();
    expect((await send(request(body))).status).toBe(400);
    expect((await state()).messages).toHaveLength(0);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    const { send } = await setup();
    const malformed = request();
    expect((await send(new Request(malformed, { body: "{" }))).status).toBe(400);
    expect((await send(request({ text: "x".repeat(64001) }))).status).toBe(413);
  });

  it.each(["phone", "channel", "agent", "sender", "line", "inactive", "ambiguous", "moved-player", "missing-player", "missing-group"])("rejects %s binding without a global phone lookup", async (mode) => {
    const { t, bindingId, otherGroupId, playerId, send, state, consult } = await setup();
    await t.run(async (ctx) => {
      const binding = (await ctx.db.get(bindingId))!;
      if (mode === "phone") await ctx.db.patch(bindingId, { conversationId: "different" });
      if (mode === "channel") await ctx.db.patch(bindingId, { channel: "whatsapp" });
      if (mode === "agent") await ctx.db.patch(bindingId, { agentId: "different" });
      if (mode === "sender") await ctx.db.patch(bindingId, { senderId: "different" });
      if (mode === "line") await ctx.db.patch(bindingId, { lineId: "2" });
      if (mode === "inactive") await ctx.db.patch(bindingId, { active: false });
      if (mode === "ambiguous") {
        const { _id, _creationTime, ...copy } = binding;
        await ctx.db.insert("keikiBindings", { ...copy, active: false });
      }
      if (mode === "moved-player") await ctx.db.patch(playerId, { groupId: otherGroupId });
      if (mode === "missing-player") await ctx.db.delete(playerId);
      if (mode === "missing-group") await ctx.db.delete(binding.groupId);
    });
    expect((await send()).status).toBe(403);
    expect((await state()).messages).toHaveLength(0);
    expect(consult).not.toHaveBeenCalled();
  });

  it("stores the verbatim bounded message, calls master once, and caches its directive without scheduling onMessage", async () => {
    const { send, state, consult, groupId, playerId } = await setup();
    const body = `  ${"x".repeat(7995)}\n `;
    const original = { ...payload, input: { ...payload.input, playerMessage: body } };
    const first = await send(request(original));
    expect(first.status).toBe(200);
    const directive = await first.json();
    const saved = await state();
    expect(saved.messages).toHaveLength(1);
    expect(saved.messages[0]).toMatchObject({ body, source: "keiki", kind: "chat", groupId, playerId, agentKey: "common", lineId: "1" });
    expect(saved.messages[0].externalId).toBeUndefined();
    expect(saved.receipts).toHaveLength(1);
    expect(saved.receipts[0]).toMatchObject({ status: "completed", messageId: saved.messages[0]._id, directiveJson: JSON.stringify(directive) });
    expect(saved.scheduled).toHaveLength(0);
    expect(consult).toHaveBeenCalledExactlyOnceWith({ groupId, playerId, messageId: saved.messages[0]._id, lineId: "1", agentKey: "common" });
    const replay = await send(request(original));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(directive);
    expect(consult).toHaveBeenCalledTimes(1);
    expect((await state()).messages).toHaveLength(1);
  });

  it.each(["revoked", "rebound"])("revalidates completed receipt after binding is %s", async (mode) => {
    const { send, t, bindingId, secondPlayerId, consult } = await setup();
    expect((await send()).status).toBe(200);
    await t.run(async (ctx) => ctx.db.patch(bindingId, mode === "revoked" ? { active: false } : { playerId: secondPlayerId }));
    expect((await send()).status).toBe(403);
    expect(consult).toHaveBeenCalledTimes(1);
  });

  it("rejects a completed trace reused with a different player message", async () => {
    const { send, consult, state } = await setup();
    expect((await send()).status).toBe(200);
    expect((await send(request({ ...payload, input: { ...payload.input, playerMessage: "A different message" } }))).status).toBe(403);
    expect(consult).toHaveBeenCalledTimes(1);
    expect((await state()).messages).toHaveLength(1);
  });

  it.each(["revoked", "rebound", "moved-player", "changed-channel", "changed-message"])("rejects completion when midturn binding is %s", async (mode) => {
    const { t, send, consult, state, bindingId, playerId, secondPlayerId, otherGroupId } = await setup();
    consult.mockImplementationOnce(async ({ messageId }) => {
      await t.run(async (ctx) => {
        if (mode === "revoked") await ctx.db.patch(bindingId, { active: false });
        if (mode === "rebound") await ctx.db.patch(bindingId, { playerId: secondPlayerId });
        if (mode === "moved-player") await ctx.db.patch(playerId, { groupId: otherGroupId });
        if (mode === "changed-channel") await ctx.db.patch(bindingId, { channel: "whatsapp" });
        if (mode === "changed-message") await ctx.db.patch(messageId, { source: "app" });
      });
      return { character: { agentKey: "common", name: "Fixture actor" }, guidance: "Must not escape" };
    });
    const response = await send();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("Must not escape");
    expect((await state()).receipts[0].status).toBe("uncertain");
  });

  it.each(["source", "agentKey"] as const)("rejects cached replay with changed message %s", async (key) => {
    const { t, send, state, consult } = await setup();
    expect((await send()).status).toBe(200);
    const messageId = (await state()).messages[0]._id;
    await t.run(async (ctx) => ctx.db.patch(messageId, key === "source" ? { source: "app" } : { agentKey: "other" }));
    expect((await send()).status).toBe(403);
    expect(consult).toHaveBeenCalledTimes(1);
  });

  it("returns 409 for an in-flight duplicate without running master twice", async () => {
    const { send, consult, state } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    consult.mockImplementationOnce(async () => {
      await gate;
      return { character: { agentKey: "common", name: "Fixture actor" }, guidance: "Only once" };
    });
    const first = send();
    await vi.waitFor(() => expect(consult).toHaveBeenCalledTimes(1));
    expect((await send()).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    expect((await state()).messages).toHaveLength(1);
  });

  it("marks master failure uncertain and never automatically retries", async () => {
    const { send, consult, state } = await setup();
    consult.mockRejectedValueOnce(new Error("private failure details"));
    const first = await send();
    expect(first.status).toBe(503);
    expect(await first.text()).not.toContain("private failure details");
    expect((await state()).receipts[0]).toMatchObject({ status: "uncertain", failureCode: "consult_unavailable" });
    expect((await send()).status).toBe(409);
    expect(consult).toHaveBeenCalledTimes(1);
  });

  it("does not rerun master when completion persistence fails", async () => {
    const { send, deps, state, consult } = await setup();
    deps.complete = async () => { throw new Error("storage failure"); };
    expect((await send()).status).toBe(503);
    expect((await state()).receipts[0].status).toBe("uncertain");
    expect((await send()).status).toBe(409);
    expect(consult).toHaveBeenCalledTimes(1);
  });

  it("scopes the same trace to two players on one line and keeps fixture directives isolated", async () => {
    const { send, playerId, secondPlayerId, state, consult } = await setup();
    const first = await send();
    const second = await send(request({ ...payload, context: { ...payload.context, phone: "+15550000002" } }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()).guidance).toBe(`Private fixture for ${playerId}`);
    expect((await second.json()).guidance).toBe(`Private fixture for ${secondPlayerId}`);
    const saved = await state();
    expect(saved.messages.map((m) => m.playerId)).toEqual([playerId, secondPlayerId]);
    expect(new Set(saved.receipts.map((r) => r.eventKey)).size).toBe(2);
    expect(consult).toHaveBeenCalledTimes(2);
  });

  it("keeps /keiki/turn disabled through the real HTTP router", async () => {
    const { t, state } = await setup();
    expect((await t.fetch("/keiki/turn", { method: "POST" })).status).toBe(503);
    expect((await state()).messages).toHaveLength(0);
  });
});

describe("demo ingress with real deterministic internal RAVO consult", () => {
  it("wires the real HTTP route through claim, master, completion, and cached replay", async () => {
    const { t, state } = await setup();
    vi.stubEnv("KEIKI_DEMO_INGRESS_ENABLED", "true");
    vi.stubEnv("KEIKI_TOOL_API_KEY", "fixture-tool-key");
    vi.stubEnv("KEIKI_DEMO_AGENT_ID", "demo-agent");
    vi.stubEnv("KEIKI_DEMO_LINE_ID", "1");
    const req = request();
    const init = { method: "POST", headers: req.headers, body: await req.text() };
    const response = await t.fetch("/keiki/consult?lineId=1", init);
    expect(response.status).toBe(200);
    const directive = await response.json();
    expect(directive).toMatchObject({ character: { agentKey: "common", name: "Sal, the night bartender" }, tone: "noir", progressDelta: 0 });
    const replay = await t.fetch("/keiki/consult?lineId=1", init);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(directive);
    expect((await state()).messages).toHaveLength(1);
    expect((await state()).receipts[0].status).toBe("completed");
  });

  it("returns the master directive, records a deduction once, and replays without repeating effects", async () => {
    const { t, send, deps, caseId, playerId, state } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("insights", { caseId, key: "proof", label: "Established deduction", weight: 1, keywords: [["proof"]], hint: "Inspect evidence" });
      await ctx.db.insert("clues", { caseId, key: "receipt", name: "Receipt", kind: "evidence", summary: "Allowed evidence", detail: "Unshared detail", unlock: { insight: "proof" } });
    });
    let consultFailure: unknown;
    deps.consult = async (args) => {
      try {
        return await t.action(internal.ravo.consult.consult, args);
      } catch (error) {
        consultFailure = error;
        throw error;
      }
    };
    const first = await send(request({ ...payload, input: { ...payload.input, playerMessage: "proof" } }));
    expect(consultFailure).toBeUndefined();
    expect(first.status).toBe(200);
    const directive = await first.json();
    expect(directive).toMatchObject({ character: { agentKey: "common", name: "Sal, the night bartender" }, reveal: { text: "Receipt: Allowed evidence" }, tone: "noir", progressDelta: 100 });
    expect(JSON.stringify(directive)).not.toContain("Unshared detail");
    const second = await send(request({ ...payload, input: { ...payload.input, playerMessage: "proof" } }));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(directive);
    const game = await t.run(async (ctx) => ({ progress: await ctx.db.query("progress").collect(), unlocks: await ctx.db.query("clueUnlocks").collect() }));
    expect(game.progress).toHaveLength(1);
    expect(game.progress[0].playerId).toBe(playerId);
    expect(game.unlocks).toHaveLength(1);
    expect((await state()).receipts).toHaveLength(1);
    expect((await state()).scheduled).toHaveLength(0);
  });
});
