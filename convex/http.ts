import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

const unavailable = httpAction(async () =>
  new Response(JSON.stringify({ error: "Keiki ingress is disabled pending verified authentication" }), {
    status: 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  }),
);

/** Keiki external-harness webhook. Builder 2: verify the Ed25519 signature, map the conversation to a group, save the message, call ravo.onMessage, return RAVO's reply. */
http.route({
  path: "/keiki/turn",
  method: "POST",
  handler: unavailable,
});

/** Tool endpoint for Keiki-hosted characters: body { groupId, playerId?, messageId, lineId, agentKey? } -> RavoDirective. Builder 2: add signature verification. */
http.route({
  path: "/keiki/consult",
  method: "POST",
  handler: unavailable,
});

export default http;
