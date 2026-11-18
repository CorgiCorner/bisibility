import { expect, test, vi } from "vitest";
import { lookupOpenRouterGeneration } from "./openrouter-generation";

const json = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

test("a generation lookup returns the tokens OpenRouter billed", async () => {
  const fetcher = json({
    data: {
      id: "gen-1",
      native_tokens_prompt: 1200,
      native_tokens_completion: 340,
      native_tokens_reasoning: 100,
      native_tokens_cached: 200,
      total_cost: 0.001,
    },
  });
  await expect(lookupOpenRouterGeneration("gen-1", "key", fetcher)).resolves.toEqual({
    inputTokens: 1200,
    cachedInputTokens: 200,
    cacheWriteTokens: 0,
    outputTokens: 340,
    reasoningTokens: 100,
  });
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://openrouter.ai/api/v1/generation?id=gen-1");
  expect(init.headers).toEqual({ authorization: "Bearer key" });
});

test("a lookup that is not ready, mismatched or malformed is no answer", async () => {
  await expect(lookupOpenRouterGeneration("gen-1", "key", json({}, 404))).resolves.toBeNull();
  await expect(
    lookupOpenRouterGeneration(
      "gen-1",
      "key",
      json({ data: { id: "gen-2", tokens_prompt: 1, tokens_completion: 1 } }),
    ),
  ).resolves.toBeNull();
  await expect(
    lookupOpenRouterGeneration("gen-1", "key", json({ data: { tokens_prompt: -1 } })),
  ).resolves.toBeNull();
  await expect(lookupOpenRouterGeneration("../x", "key", json({}))).resolves.toBeNull();
  const failing = vi.fn(async () => {
    throw new Error("offline");
  });
  await expect(lookupOpenRouterGeneration("gen-1", "key", failing)).resolves.toBeNull();
});
