import type { Id } from "../_generated/dataModel";
import type { RavoDirective } from "../ravo/types";

export type Transport = {
  agentId: string;
  channel: string;
  conversationId: string;
  senderId: string;
  lineId: string;
};

export type Claim =
  | { status: "rejected" }
  | { status: "pending" | "uncertain" }
  | { status: "completed"; directiveJson: string }
  | {
      status: "claimed";
      receiptId: Id<"keikiReceipts">;
      messageId: Id<"messages">;
      groupId: Id<"groups">;
      playerId: Id<"players">;
    };

export type Dependencies = {
  claim: (args: Transport & { eventKey: string; body: string }) => Promise<Claim>;
  consult: (args: {
    groupId: Id<"groups">;
    playerId: Id<"players">;
    messageId: Id<"messages">;
    lineId: string;
    agentKey: string;
  }) => Promise<RavoDirective>;
  complete: (receiptId: Id<"keikiReceipts">, directiveJson: string) => Promise<unknown>;
  uncertain: (receiptId: Id<"keikiReceipts">) => Promise<unknown>;
};

export type DemoConfig = {
  enabled?: string;
  apiKey?: string;
  agentId?: string;
  lineId?: string;
  telegramBotId?: string;
};

function json(value: unknown, status: number) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function disabledTurn() {
  return json({ error: "Keiki external harness is disabled" }, 503);
}

async function constantTimeEqual(actual: string, expected: string) {
  const encode = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(actual)),
    crypto.subtle.digest("SHA-256", encode.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function only(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function handleConsult(request: Request, config: DemoConfig, deps: Dependencies): Promise<Response> {
  if (config.enabled !== "true" || !nonempty(config.apiKey) || !nonempty(config.agentId) || config.lineId !== "1" || !config.telegramBotId || !/^\d{1,20}$/.test(config.telegramBotId)) {
    return json({ error: "Keiki demo ingress is disabled or unconfigured" }, 503);
  }
  const key = request.headers.get("X-Orchid-Api-Key");
  if (!key || !(await constantTimeEqual(key, config.apiKey))) {
    const present = Object.fromEntries(
      ["x-orchid-api-key", "x-orchid-trace-id", "x-orchid-internal", "authorization", "x-orchid-signature", "x-orchid-timestamp", "x-keiki-signature", "x-signature", "x-hub-signature-256", "content-type"]
        .map((name) => [name, request.headers.has(name)]),
    );
    console.log("keiki-consult-auth-rejected", JSON.stringify({
      present,
      keyLengthMatches: key !== null && key.length === config.apiKey.length,
    }));
    return json({ error: "Unauthorized" }, 401);
  }
  if (request.headers.has("X-Orchid-Internal")) return json({ error: "Dashboard turns are not supported" }, 403);
  const url = new URL(request.url);
  if (url.searchParams.getAll("lineId").length !== 1 || url.searchParams.get("lineId") !== config.lineId ||
      url.searchParams.getAll("botId").length !== 1 || url.searchParams.get("botId") !== config.telegramBotId ||
      [...url.searchParams.keys()].some((key) => key !== "lineId" && key !== "botId")) {
    return json({ error: "Invalid route" }, 400);
  }
  const traceId = request.headers.get("X-Orchid-Trace-Id");
  if (!nonempty(traceId) || traceId.length > 256) return json({ error: "Invalid demo trace id" }, 400);
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > 64000) return json({ error: "Request too large" }, 413);
    payload = JSON.parse(text);
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  if (!record(payload) || !only(payload, ["input", "context"]) || !record(payload.input) || !record(payload.context)) {
    return json({ error: "Invalid request" }, 400);
  }
  const { input, context } = payload;
  if ("internal" in context) return json({ error: "Dashboard turns are not supported" }, 403);
  if (!only(input, ["playerMessage", "summary", "intent"]) || !only(context, ["phone", "channel"]) ||
      !nonempty(input.playerMessage) || input.playerMessage.length > 8000 ||
      typeof input.summary !== "string" || input.summary.length > 1000 ||
      typeof input.intent !== "string" || !["theory", "question", "answer", "chat", "join"].includes(input.intent) ||
      !nonempty(context.phone) || context.phone.length > 256 ||
      context.channel !== "telegram") {
    return json({ error: "Invalid request" }, 400);
  }
  const transport: Transport = {
    agentId: config.agentId,
    channel: context.channel,
    conversationId: JSON.stringify(["telegram", config.telegramBotId, context.phone]),
    senderId: context.phone,
    lineId: config.lineId,
  };
  const eventKey = JSON.stringify(["keiki-demo-trace", transport.agentId, transport.channel, transport.conversationId, transport.senderId, transport.lineId, traceId]);
  let claim: Claim;
  try {
    claim = await deps.claim({ ...transport, eventKey, body: input.playerMessage });
  } catch {
    return json({ error: "Consult unavailable" }, 503);
  }
  if (claim.status === "rejected") return json({ error: "Unknown or invalid binding" }, 403);
  if (claim.status === "completed") {
    return json({ error: "Completed trace requires current directive authorization; no automatic retry" }, 409);
  }
  if (claim.status !== "claimed") return json({ error: "Demo trace already claimed; no automatic retry" }, 409);
  try {
    const directive = await deps.consult({ groupId: claim.groupId, playerId: claim.playerId, messageId: claim.messageId, lineId: transport.lineId, agentKey: "common" });
    const directiveJson = JSON.stringify(directive);
    await deps.complete(claim.receiptId, directiveJson);
    return json(directive, 200);
  } catch {
    try {
      await deps.uncertain(claim.receiptId);
    } catch {
      return json({ error: "Consult unavailable; no automatic retry" }, 503);
    }
    return json({ error: "Consult unavailable; no automatic retry" }, 503);
  }
}
