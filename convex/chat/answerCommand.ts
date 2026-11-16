import type { FunctionArgs } from "convex/server";
import type { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

type Transport = Pick<Doc<"keikiBindings">, "agentId" | "channel" | "conversationId" | "senderId" | "lineId">;

export type VerifiedCommandEnvelope = Readonly<Transport & {
  provenance: "caller-verified-provider-message";
  eventId: string;
  rawText: string;
}>;

export type AnswerCommand = Extract<FunctionArgs<typeof internal.game.commands.dispatch.dispatch>["command"], { kind: "answer" }>;

export type AnswerParseResult =
  | { ok: true; command: AnswerCommand }
  | { ok: false; error: "unverified" | "binding" | "length" | "characters" | "syntax" | "unsupported" | "question"; message: string };

export function parseVerifiedAnswer(
  envelope: VerifiedCommandEnvelope,
  binding: Readonly<Transport & Pick<Doc<"keikiBindings">, "active">>,
  publicQuestionKeys: readonly string[],
): AnswerParseResult {
  if (envelope.provenance !== "caller-verified-provider-message") {
    return { ok: false, error: "unverified", message: "A verified private message is required." };
  }
  const transportFields = ["agentId", "channel", "conversationId", "senderId", "lineId"] as const;
  if (!binding.active || transportFields.some((field) =>
    typeof envelope[field] !== "string" || !envelope[field].trim() || envelope[field].length > 256 ||
    envelope[field] !== binding[field]) || typeof envelope.eventId !== "string" ||
    !envelope.eventId.trim() || envelope.eventId.length > 256) {
    return { ok: false, error: "binding", message: "This message does not match the private conversation." };
  }
  if (typeof envelope.rawText !== "string" || envelope.rawText.length > 8000) {
    return { ok: false, error: "length", message: "Keep the command within 8,000 UTF-16 code units." };
  }
  const text = envelope.rawText;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\uD800-\uDFFF]/u.test(text)) {
    return { ok: false, error: "characters", message: "Remove control characters or invalid Unicode from the command." };
  }
  if (/^(?:SURVEY|ABILITY|HINT|ACCUSE|ACCUSATION|RECOVER|JOIN|NEW)(?:\s|$)/i.test(text)) {
    return { ok: false, error: "unsupported", message: "Only ANSWER commands are supported here." };
  }
  const match = /^ANSWER ([A-Za-z0-9][A-Za-z0-9_-]{0,63}): ?([\s\S]+)$/.exec(text);
  if (!match || !match[2].trim() || /[\r\n\u2028\u2029]\s*ANSWER\b/iu.test(match[2])) {
    return { ok: false, error: "syntax", message: "Send one command: ANSWER <question key>: <your answer>" };
  }
  const [, questionKey, answer] = match;
  if (answer.length > 4000) {
    return { ok: false, error: "length", message: "Keep the answer within 4,000 UTF-16 code units." };
  }
  if (publicQuestionKeys.filter((key) => key === questionKey).length !== 1) {
    return { ok: false, error: "question", message: "Use a question key shown for your current session." };
  }
  return { ok: true, command: { kind: "answer", questionKey, text: answer } };
}
