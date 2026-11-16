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
    apiKey: process.env.KEIKI_TOOL_API_KEY,
    agentId: process.env.KEIKI_DEMO_AGENT_ID,
    lineId: process.env.KEIKI_DEMO_LINE_ID,
    telegramBotId: process.env.KEIKI_DEMO_TELEGRAM_BOT_ID,
  }, {
    claim: (args) => ctx.runMutation(internal.chat.keikiIngress.claim, args),
    consult: (args) => ctx.runAction(internal.ravo.consult.consult, args),
    complete: (receiptId, directiveJson) => ctx.runMutation(internal.chat.keikiIngress.complete, { receiptId, directiveJson }),
    uncertain: (receiptId) => ctx.runMutation(internal.chat.keikiIngress.uncertain, { receiptId }),
  })),
});

export default http;
