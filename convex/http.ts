import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { disabledTurn, handleConsult } from "./chat/keikiHandler";

const http = httpRouter();

http.route({
  path: "/keiki/turn",
  method: "POST",
  handler: httpAction(async () => disabledTurn()),
});

http.route({
  path: "/keiki/consult",
  method: "POST",
  handler: httpAction(async (ctx, request) => handleConsult(request, {
    enabled: process.env.KEIKI_DEMO_INGRESS_ENABLED,
    agentId: process.env.KEIKI_DEMO_AGENT_ID,
    lineId: process.env.KEIKI_DEMO_LINE_ID,
    telegramBotId: process.env.KEIKI_DEMO_TELEGRAM_BOT_ID,
    lines: process.env.KEIKI_DEMO_AGENT_ID_1 ? Object.fromEntries(["1", "2", "3"].map((id) => [id, { agentId: process.env[`KEIKI_DEMO_AGENT_ID_${id}`], telegramBotId: process.env[`KEIKI_DEMO_TELEGRAM_BOT_ID_${id}`] }])) : undefined,
  }, {
    claim: (args) => ctx.runMutation(internal.chat.keikiIngress.claim, args),
    consult: (args) => ctx.runAction(internal.ravo.consult.consult, args),
    complete: (receiptId, directiveJson) => ctx.runMutation(internal.chat.keikiIngress.complete, { receiptId, directiveJson }),
    uncertain: (receiptId) => ctx.runMutation(internal.chat.keikiIngress.uncertain, { receiptId }),
    memory: (args) => ctx.runQuery(internal.chat.messages.sharedMemory, args),
  })),
});

export default http;
