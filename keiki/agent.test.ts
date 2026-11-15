import { afterEach, describe, expect, it, vi } from "vitest";
import { demoToolConfig, linePrompt, setLinePrompt } from "./agent";

afterEach(() => vi.unstubAllEnvs());

describe("neutral shared-line tool configuration", () => {
  it("pins the explicit common line outside model arguments", () => {
    const tool = demoToolConfig("https://demo.convex.site/keiki/consult", "1");
    expect(tool.webhookUrl).toBe("https://demo.convex.site/keiki/consult?lineId=1");
    expect(Object.keys(tool.inputSchema.properties)).toEqual(["playerMessage", "summary", "intent"]);
    expect(tool.inputSchema.additionalProperties).toBe(false);
  });

  it("has no per-player character sheet or fixed character assignment", () => {
    expect(linePrompt).toContain("Play directive.character");
    expect(linePrompt).toContain("Never invent clues");
    expect(linePrompt).toContain("If the tool fails");
    expect(linePrompt).not.toContain("Marlow");
  });

  it("rejects ambiguous line or URL configuration", () => {
    for (const url of ["http://demo.convex.site/keiki/consult", "https://demo.convex.site/keiki/consult?playerId=other", "https://secret@demo.convex.site/keiki/consult", "https://demo.convex.site/wrong"]) {
      expect(() => demoToolConfig(url, "1")).toThrow();
    }
    expect(() => demoToolConfig("https://demo.convex.site/keiki/consult", "2")).toThrow();
  });

  it("upserts an isolated neutral deployment without connecting channels (fake Keiki)", async () => {
    vi.stubEnv("KEIKI_API_KEY", "fixture-key-not-a-real-secret");
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const send = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (input, init) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Response.json({ deployment: { agent: { id: "demo-agent" } }, created: requests.length === 1 });
    });
    const config = { externalRef: "isolated-consult-fixture", consultUrl: "https://demo.convex.site/keiki/consult", lineId: "1" };
    expect(await setLinePrompt(config, send)).toMatchObject({ agentId: "demo-agent", created: true });
    expect(await setLinePrompt(config, send)).toMatchObject({ agentId: "demo-agent", created: false });
    expect(requests[0]).toEqual(requests[1]);
    expect(requests[0].body).toMatchObject({ external_ref: config.externalRef, channels: [], agent: { system_prompt: linePrompt } });
    expect(JSON.stringify(requests[0].body)).not.toContain("fixture-key");
  });

  it("preserves the existing standalone agent and fails safely without credentials", async () => {
    const send = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
    const config = { externalRef: "ravo-common", consultUrl: "https://demo.convex.site/keiki/consult", lineId: "1" };
    await expect(setLinePrompt(config, send)).rejects.toThrow("standalone");
    vi.stubEnv("KEIKI_API_KEY", "");
    await expect(setLinePrompt({ ...config, externalRef: "isolated-consult-fixture" }, send)).rejects.toThrow("required");
    expect(send).not.toHaveBeenCalled();
  });

  it("does not relay provider error bodies or credentials", async () => {
    vi.stubEnv("KEIKI_API_KEY", "fixture-key-not-a-real-secret");
    const send = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response("sensitive provider diagnostic", { status: 403 }));
    await expect(setLinePrompt({ externalRef: "isolated-consult-fixture", consultUrl: "https://demo.convex.site/keiki/consult", lineId: "1" }, send)).rejects.toThrow("Keiki configuration failed (403)");
  });
});
