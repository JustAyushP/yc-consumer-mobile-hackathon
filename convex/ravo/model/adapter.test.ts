import { describe, expect, it, vi } from "vitest";
import { completeText, selectReviewedOption, type ModelProvider } from "./adapter";

const options = [
  { id: "fixture-a", text: "A reviewed fixture line." },
  { id: "fixture-b", text: "Another reviewed fixture line." },
] as const;

describe("bounded model adapter", () => {
  it("preserves the legacy text result and validates the response", async () => {
    expect(await completeText({ provider: async () => ({ text: "  Hello, Detective.  ", finishReason: "stop" }), fallback: "Hello, Detective.", offline: false }))
      .toEqual({ text: "Hello, Detective.", source: "llm" });
    for (const response of [null, {}, { text: 42, finishReason: "stop" }, { text: "  ", finishReason: "stop" }, { text: "x".repeat(1001), finishReason: "stop" }, { text: "bad\u0000text", finishReason: "stop" }, { text: "unreviewed", finishReason: "stop" }, { text: "scripted", finishReason: "length" }, { text: "scripted", finishReason: "content-filter" }, { get text(): never { throw new Error("provider error"); }, finishReason: "stop" }]) {
      expect(await completeText({ provider: async () => response, fallback: "scripted", offline: false }))
        .toEqual({ text: "scripted", source: "fallback" });
    }
  });

  it("does not call a provider offline or expose thrown errors", async () => {
    const provider = vi.fn(async () => { throw new Error("sensitive provider error"); });
    expect(await completeText({ provider, fallback: "scripted", offline: true })).toEqual({ text: "scripted", source: "fallback" });
    expect(provider).not.toHaveBeenCalled();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await completeText({ provider, fallback: "scripted", offline: false })).toEqual({ text: "scripted", source: "fallback" });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("returns at the deadline and signals abort even when the provider ignores it", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const provider: ModelProvider = (s) => { signal = s; return new Promise(() => {}); };
      const result = completeText({ provider, fallback: "scripted", offline: false, timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      expect(await result).toEqual({ text: "scripted", source: "fallback" });
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("selects only an eligible reviewed option and returns its original text", async () => {
    const provider = async () => ({ text: JSON.stringify({ optionId: "fixture-b" }), finishReason: "stop" });
    expect(await selectReviewedOption({ options, provider, offline: false })).toEqual({ option: options[1], source: "llm" });
    for (const text of ["not json", "{}", '{"optionId":"fixture-c"}', '{"optionId":"fixture-b","text":"invented"}', '{"optionId":1}', "[]"]) {
      expect(await selectReviewedOption({ options, provider: async () => ({ text, finishReason: "stop" }), offline: false }))
        .toEqual({ option: options[0], source: "fallback" });
    }
  });

  it("falls back deterministically on denied, offline, and slow selection", async () => {
    const denied = vi.fn(async () => { throw new Error("gateway denied"); });
    expect(await selectReviewedOption({ options, provider: denied, offline: false })).toEqual({ option: options[0], source: "fallback" });
    expect(await selectReviewedOption({ options, provider: denied, offline: true })).toEqual({ option: options[0], source: "fallback" });
    expect(denied).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    try {
      const result = selectReviewedOption({ options, provider: () => new Promise(() => {}), offline: false, timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      expect(await result).toEqual({ option: options[0], source: "fallback" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses empty or ambiguous option sets without contacting the provider", async () => {
    const provider = vi.fn(async () => ({ text: '{"optionId":"fixture-a"}', finishReason: "stop" }));
    for (const invalid of [[], [options[0], options[0]], [{ id: "", text: "fixture" }], [{ id: "fixture", text: " " }]]) {
      expect(await selectReviewedOption({ options: invalid, provider, offline: false })).toBeNull();
    }
    expect(provider).not.toHaveBeenCalled();
  });
});
