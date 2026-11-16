/// <reference types="node" />
"use node";

import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { generateText } from "ai";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { completeText } from "./model/adapter";

export const RAVO_PERSONA = [
  "You are RAVO, the AI game master of a noir murder-mystery game played by a small team of friends acting as detectives.",
  "Voice: clipped, wry, 1940s noir narration. Short sentences. Address players as 'Detective <name>'.",
  "You are on the detectives' side and never reveal the culprit before the final accusation.",
  "Keep replies under 45 words. No emoji. No markdown.",
].join(" ");

export const complete = internalAction({
  args: { groupId: v.id("groups"), prompt: v.string(), fallback: v.string() },
  returns: v.object({ text: v.string(), source: v.union(v.literal("llm"), v.literal("fallback")) }),
  handler: async (_ctx, { prompt, fallback }): Promise<{ text: string; source: "llm" | "fallback" }> =>
    completeText({
      fallback,
      offline: process.env.RAVO_OFFLINE === "1",
      provider: async (signal) => generateText({
        model: convexGateway(process.env.RAVO_MODEL ?? "anthropic/claude-haiku-4.5"),
        system: RAVO_PERSONA,
        prompt,
        abortSignal: signal,
        maxRetries: 0,
        maxOutputTokens: 160,
      }),
    }),
});
