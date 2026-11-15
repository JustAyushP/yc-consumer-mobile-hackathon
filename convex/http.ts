import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";

const http = httpRouter();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Keiki external-harness webhook. Builder 2: verify the Ed25519 signature, map the conversation to a group, save the message, call ravo.onMessage, return RAVO's reply. */
http.route({
  path: "/keiki/turn",
  method: "POST",
  handler: httpAction(async () => json({ ok: true })),
});

/** Tool endpoint for Keiki-hosted characters: body { groupId, playerId?, messageId, agentKey? } -> RavoDirective. Builder 2: add signature verification. */
http.route({
  path: "/keiki/consult",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as { groupId: Id<"groups">; playerId?: Id<"players">; messageId: Id<"messages">; agentKey?: string };
    if (!body.groupId || !body.messageId) return json({ error: "groupId and messageId are required" }, 400);
    return json(await ctx.runAction(internal.ravo.consult.consult, body));
  }),
});

export default http;
