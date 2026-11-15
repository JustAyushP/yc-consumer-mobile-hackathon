/// <reference types="node" />
"use node";

import { Agent } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

export const RAVO_PERSONA = [
  "You are RAVO, the AI game master of a noir murder-mystery game played by a small team of friends acting as detectives.",
  "Voice: clipped, wry, 1940s noir narration. Short sentences. Address players as 'Detective <name>'.",
  "You are on the detectives' side and never reveal the culprit before the final accusation.",
  "Keep replies under 45 words. No emoji. No markdown.",
].join(" ");

const MODEL = process.env.RAVO_MODEL ?? "anthropic/claude-haiku-4.5";
const TIMEOUT_MS = 20000;

const ravo = new Agent(components.agent, { name: "RAVO", languageModel: convexGateway(MODEL), instructions: RAVO_PERSONA });

/**
 * The one LLM wrapper. Uses one agent thread per group through the Convex AI gateway.
 * Returns `fallback` when the model fails, times out, or RAVO_OFFLINE=1, so the demo never depends on the LLM.
 */
export const complete = internalAction({
  args: { groupId: v.id("groups"), prompt: v.string(), fallback: v.string() },
  returns: v.object({ text: v.string(), source: v.union(v.literal("llm"), v.literal("fallback")) }),
  handler: async (ctx, { groupId, prompt, fallback }): Promise<{ text: string; source: "llm" | "fallback" }> => {
    if (process.env.RAVO_OFFLINE === "1") return { text: fallback, source: "fallback" as const };
    try {
      let threadId: string | null = await ctx.runQuery(internal.ravo.threads.get, { groupId });
      if (!threadId) {
        threadId = (await ravo.createThread(ctx, { title: "RAVO" })).threadId;
        await ctx.runMutation(internal.ravo.threads.set, { groupId, threadId });
      }
      const result = await Promise.race([
        ravo.generateText(ctx, { threadId }, { prompt }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
      ]);
      const text: string | undefined = result?.text?.trim();
      return text ? { text, source: "llm" as const } : { text: fallback, source: "fallback" as const };
    } catch (error) {
      console.error("RAVO LLM failed, using fallback:", error);
      return { text: fallback, source: "fallback" as const };
    }
  },
});
