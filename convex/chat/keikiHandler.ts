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
    agentKey?: string;
  }) => Promise<RavoDirective>;
  complete: (receiptId: Id<"keikiReceipts">, directiveJson: string) => Promise<unknown>;
  uncertain: (receiptId: Id<"keikiReceipts">) => Promise<unknown>;
  memory?: (args: { playerId: Id<"players">; messageId: Id<"messages">; agentKey: string }) => Promise<string>;
  judge?: (messageId: Id<"messages">) => Promise<unknown>;
};

export type DemoConfig = {
  enabled?: string;
  agentId?: string;
  lineId?: string;
  telegramBotId?: string;
  lines?: Record<string, { agentId?: string; telegramBotId?: string }>;
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
  const lines = Object.entries(config.lines ?? (config.lineId === "1" ? { "1": { agentId: config.agentId, telegramBotId: config.telegramBotId } } : {}))
    .filter(([id, line]) => ["1", "2", "3"].includes(id) && nonempty(line.agentId) && !!line.telegramBotId && /^\d{1,20}$/.test(line.telegramBotId));
  if (config.enabled !== "true" || !lines.length) {
    return json({ error: "Keiki demo ingress is disabled or unconfigured" }, 503);
  }
  if (request.headers.has("X-Orchid-Internal")) return json({ error: "Dashboard turns are not supported" }, 403);
  const url = new URL(request.url);
  const lineId = url.searchParams.get("lineId");
  const line = lines.find(([id]) => id === lineId)?.[1];
  if (url.searchParams.getAll("lineId").length !== 1 || !line || !lineId ||
      url.searchParams.getAll("botId").length !== 1 || url.searchParams.get("botId") !== line.telegramBotId ||
      [...url.searchParams.keys()].some((key) => key !== "lineId" && key !== "botId")) {
    return json({ error: "Invalid route", reason: "invalid_route" }, 400);
  }
  const traceId = request.headers.get("X-Orchid-Trace-Id");
  if (!nonempty(traceId) || traceId.length > 256) return json({ error: "Invalid demo trace id", reason: "invalid_trace_id" }, 400);
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > 64000) return json({ error: "Request too large" }, 413);
    payload = JSON.parse(text);
  } catch {
    return json({ error: "Invalid request", reason: "invalid_json" }, 400);
  }
  if (!record(payload) || !only(payload, ["input", "context"])) {
    return json({ error: "Invalid request", reason: "invalid_envelope" }, 400);
  }
  if (!record(payload.input)) return json({ error: "Invalid request", reason: "invalid_input" }, 400);
  if (!record(payload.context)) return json({ error: "Invalid request", reason: "invalid_context" }, 400);
  const { input, context } = payload;
  if ("internal" in context) return json({ error: "Dashboard turns are not supported" }, 403);
  const declaredChannel = record(context.channel) ? context.channel.channel : context.channel;
  if (declaredChannel === "internal" || declaredChannel === "dashboard") return json({ error: "Invalid request", reason: "invalid_channel" }, 400);
  if (!only(input, ["playerMessage", "summary", "intent"])) return json({ error: "Invalid request", reason: "unsupported_input_fields" }, 400);
  if (!nonempty(input.playerMessage) || input.playerMessage.length > 8000) return json({ error: "Invalid request", reason: "invalid_player_message" }, 400);
  if (typeof input.summary !== "string" || input.summary.length > 1000) return json({ error: "Invalid request", reason: "invalid_summary" }, 400);
  if (typeof input.intent !== "string" || !["theory", "question", "answer", "chat", "join"].includes(input.intent)) return json({ error: "Invalid request", reason: "invalid_intent" }, 400);
  if (!nonempty(context.phone) || context.phone.length > 256) return json({ error: "Invalid request", reason: "invalid_phone" }, 400);
  const transport: Transport = {
    agentId: line.agentId!,
    channel: "telegram",
    conversationId: JSON.stringify(["telegram", line.telegramBotId, context.phone]),
    senderId: context.phone,
    lineId,
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
  if (deps.judge) await deps.judge(claim.messageId).catch(() => null);
  try {
    const directive = await deps.consult({ groupId: claim.groupId, playerId: claim.playerId, messageId: claim.messageId, lineId: transport.lineId, agentKey: transport.lineId === "1" ? "common" : undefined });
    const directiveJson = JSON.stringify(directive);
    await deps.complete(claim.receiptId, directiveJson);
    const memory = deps.memory ? await deps.memory({ playerId: claim.playerId, messageId: claim.messageId, agentKey: directive.character.agentKey }).catch(() => "") : "";
    return json(memory ? { ...directive, guidance: `${directive.guidance}\n${memory}` } : directive, 200);
  } catch {
    try {
      await deps.uncertain(claim.receiptId);
    } catch {
      return json({ error: "Consult unavailable; no automatic retry" }, 503);
    }
    return json({ error: "Consult unavailable; no automatic retry" }, 503);
  }
}
