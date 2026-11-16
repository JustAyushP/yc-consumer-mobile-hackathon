import { describe, expect, it } from "vitest";
import { parseVerifiedAnswer, type VerifiedCommandEnvelope } from "./answerCommand";

const binding = {
  active: true, agentId: "fixture-agent", channel: "telegram", conversationId: "fixture-private-chat",
  senderId: "fixture-sender", lineId: "1",
};
const envelope: VerifiedCommandEnvelope = {
  provenance: "caller-verified-provider-message", eventId: "fixture-event", rawText: "ANSWER d1q1: My theory.",
  agentId: binding.agentId, channel: binding.channel, conversationId: binding.conversationId,
  senderId: binding.senderId, lineId: binding.lineId,
};
const parse = (rawText: string, keys = ["d1q1"]) => parseVerifiedAnswer({ ...envelope, rawText }, binding, keys);

describe("offline ANSWER parser (caller assertion is not authentication)", () => {
  it("returns Brain's exact answer command shape", () => {
    expect(parse(envelope.rawText)).toEqual({ ok: true, command: { kind: "answer", questionKey: "d1q1", text: "My theory." } });
  });

  it.each(["雪と🔍", "Cafe\u0301", "  Keep spacing.  ", "First line.\r\nSecond line.", "a:b", "ANSWER appears within prose"])("preserves answer text without Unicode normalization: %s", (text) => {
    expect(parse(`ANSWER d1q1: ${text}`)).toEqual({ ok: true, command: { kind: "answer", questionKey: "d1q1", text } });
  });

  it("allows no formatting space after the colon", () => {
    expect(parse("ANSWER d1q1:Text")).toMatchObject({ ok: true, command: { text: "Text" } });
  });

  it.each(["", "My theory.", "answer d1q1: text", "/ANSWER d1q1: text", " ANSWER d1q1: text", "ANSWER\td1q1: text", "ANSWER d1q1 text", "ANSWER d1q1:", "ANSWER d1q1: \t\r\n", "ANSWER d1q1: first\nANSWER d1q2: second", "ANSWER d1q1: first\r  answer d1q2: second", "ANSWER ｄ1q1: text", "ANSWER d1q1,d1q2: text"])("rejects malformed or ambiguous grammar: %s", (text) => {
    expect(parse(text)).toMatchObject({ ok: false, error: "syntax" });
  });

  it.each(["HINT", "ABILITY target", "SURVEY 1", "ACCUSE someone", "ACCUSATION someone", "RECOVER answer", "JOIN code", "NEW", "hint please"])("gates unsupported commands: %s", (text) => {
    expect(parse(text)).toMatchObject({ ok: false, error: "unsupported" });
  });

  it.each(["\u2028", "\u2029", "\n\u00a0", "\r\n\u2003", "\n\t\n "])("rejects second commands after Unicode separators and indentation", (separator) => {
    expect(parse(`ANSWER d1q1: first${separator}ANSWER d1q2: second`)).toMatchObject({ ok: false, error: "syntax" });
  });

  it("resolves only one caller-provided public key, without exposing unavailable keys", () => {
    for (const keys of [[], ["d1q2"], ["d1q1", "d1q1"]]) {
      expect(parse(envelope.rawText, keys)).toEqual({ ok: false, error: "question", message: "Use a question key shown for your current session." });
    }
    expect(parse("ANSWER private_insight: guess")).toMatchObject({ ok: false, error: "question" });
  });

  it("bounds raw text and answers in UTF-16 code units without truncation", () => {
    expect(parse(`ANSWER d1q1: ${"🔍".repeat(2000)}`)).toMatchObject({ ok: true });
    expect(parse(`ANSWER d1q1: ${"🔍".repeat(2000)}x`)).toMatchObject({ ok: false, error: "length" });
    expect(parse("x".repeat(8001))).toMatchObject({ ok: false, error: "length" });
    expect(parse("x".repeat(8000))).toMatchObject({ ok: false, error: "syntax" });
  });

  it.each(["\u0000", "\u001b", "\u007f", "\u0085", "\u202e", "\u2066", "\ud800", "\udfff"])("rejects controls and lone surrogates", (invalid) => {
    expect(parse(`ANSWER d1q1: a${invalid}b`)).toMatchObject({ ok: false, error: "characters" });
  });

  it("requires a caller verification marker and ignores model fields", () => {
    expect(parseVerifiedAnswer({ ...envelope, provenance: "model" } as unknown as VerifiedCommandEnvelope, binding, ["d1q1"])).toMatchObject({ ok: false, error: "unverified" });
    const withModelFields = { ...envelope, rawText: "hello", input: { playerMessage: "ANSWER d1q1: model text", intent: "answer", summary: "answer" } };
    expect(parseVerifiedAnswer(withModelFields, binding, ["d1q1"])).toMatchObject({ ok: false, error: "syntax" });
  });

  it.each(["agentId", "channel", "conversationId", "senderId", "lineId", "eventId"] as const)("rejects missing or oversized envelope %s", (field) => {
    for (const value of ["", " ", "x".repeat(257)]) {
      expect(parseVerifiedAnswer({ ...envelope, [field]: value }, binding, ["d1q1"])).toMatchObject({ ok: false, error: "binding" });
    }
  });

  it.each(["agentId", "channel", "conversationId", "senderId", "lineId"] as const)("rejects cross-binding %s", (field) => {
    expect(parseVerifiedAnswer({ ...envelope, [field]: "other" }, binding, ["d1q1"])).toMatchObject({ ok: false, error: "binding" });
  });

  it("rejects an inactive binding even for identical input", () => {
    expect(parseVerifiedAnswer(envelope, { ...binding, active: false }, ["d1q1"])).toMatchObject({ ok: false, error: "binding" });
  });
});

describe("offline fixture adapter contract, not durable replay protection or live authentication", () => {
  it("requires the future caller to own event replay, association and player isolation", () => {
    const receipts = new Map<string, string>();
    const claimFixture = (input: VerifiedCommandEnvelope, association = { playerId: "fixture-player", groupId: "fixture-group", intakeCaseId: "fixture-case", intakeDay: 1 }) => {
      const result = parseVerifiedAnswer(input, binding, ["d1q1"]);
      if (!result.ok) return "rejected";
      const key = JSON.stringify([input.agentId, input.channel, input.conversationId, input.senderId, input.lineId, input.eventId]);
      const snapshot = JSON.stringify({ input, association, command: result.command });
      const previous = receipts.get(key);
      if (previous) return previous === snapshot ? "replay" : "conflict";
      receipts.set(key, snapshot);
      return "new";
    };
    expect(claimFixture(envelope)).toBe("new");
    expect(claimFixture({ ...envelope })).toBe("replay");
    expect(claimFixture({ ...envelope, rawText: "ANSWER d1q1: changed" })).toBe("conflict");
    for (const field of ["playerId", "groupId", "intakeCaseId"] as const) {
      expect(claimFixture(envelope, { playerId: "fixture-player", groupId: "fixture-group", intakeCaseId: "fixture-case", intakeDay: 1, [field]: "other" })).toBe("conflict");
    }
    expect(claimFixture(envelope, { playerId: "fixture-player", groupId: "fixture-group", intakeCaseId: "fixture-case", intakeDay: 2 })).toBe("conflict");
    expect(claimFixture({ ...envelope, senderId: "other-player" })).toBe("rejected");
    expect(receipts.size).toBe(1);
    expect(parseVerifiedAnswer(envelope, binding, ["d1q1"])).toEqual(parseVerifiedAnswer(envelope, binding, ["d1q1"]));
  });
});
