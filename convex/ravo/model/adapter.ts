export type ModelProvider = (signal: AbortSignal) => Promise<unknown>;
export type Completion = { text: string; source: "llm" | "fallback" };

const TIMEOUT_MS = 5_000;

async function bounded(provider: ModelProvider, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider(controller.signal)),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(undefined);
        }, timeoutMs);
      }),
    ]);
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function responseText(response: unknown): string | undefined {
  try {
    if (response === null || typeof response !== "object" || !("text" in response) ||
      !("finishReason" in response) || response.finishReason !== "stop") return undefined;
    const text = response.text;
    if (typeof text !== "string") return undefined;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 1_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed)) return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

export async function completeText(input: {
  provider: ModelProvider;
  fallback: string;
  offline: boolean;
  timeoutMs?: number;
}): Promise<Completion> {
  const fallback: Completion = { text: input.fallback, source: "fallback" };
  if (input.offline) return fallback;
  const text = responseText(await bounded(input.provider, input.timeoutMs ?? TIMEOUT_MS));
  return text === input.fallback ? { text, source: "llm" } : fallback;
}

export type ReviewedOption = { id: string; text: string };

export async function selectReviewedOption(input: {
  options: readonly ReviewedOption[];
  provider: ModelProvider;
  offline: boolean;
  timeoutMs?: number;
}): Promise<{ option: ReviewedOption; source: "llm" | "fallback" } | null> {
  const options = input.options;
  if (!options.length || options.some((option) => !option.id.trim() || !option.text.trim()) ||
    new Set(options.map((option) => option.id)).size !== options.length) return null;
  const fallback = { option: options[0], source: "fallback" as const };
  if (input.offline) return fallback;
  const text = responseText(await bounded(input.provider, input.timeoutMs ?? TIMEOUT_MS));
  if (text === undefined) return fallback;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 || !("optionId" in parsed) || typeof parsed.optionId !== "string") return fallback;
    const option = options.find((candidate) => candidate.id === parsed.optionId);
    return option ? { option, source: "llm" } : fallback;
  } catch {
    return fallback;
  }
}
