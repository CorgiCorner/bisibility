import { afterEach, beforeEach, expect, it, vi } from "vitest";

const official = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/ai-research/official-model-rates", () => ({
  fetchOfficialModelRates: official.fetch,
}));

import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import { trackingModelForecast, trackingPriceBound } from "./pricing";

const configuration: SourceConfiguration = {
  provider: "dataforseo",
  engine: "chat_gpt",
  source: "model_api",
  endpoint: "ai_optimization/chat_gpt/llm_responses/task_post",
  model: "gpt-expanded-model",
  parameters: {
    max_output_tokens: 2048,
    web_search: true,
    cost_policy: "provider_actual_cost",
    actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
    estimated_cost_limit_cents: 100,
  },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
  official.fetch.mockResolvedValue(
    new Map([
      [
        configuration.model,
        {
          inputUsdPerMillion: 2,
          outputUsdPerMillion: 8,
          contextTokens: 128000,
          maxOutputTokens: 16000,
          checkedAt: "2026-10-08T12:00:00Z",
          sourceUrl: "https://developers.openai.com/api/docs/models/gpt-expanded-model",
          limitsSourceUrl: "https://developers.openai.com/api/docs/models/gpt-expanded-model",
        },
      ],
    ]),
  );
});
afterEach(() => vi.useRealTimers());
it("allows expanded officially priced models only with versioned non-guaranteed actual-cost consent", async () => {
  expect(
    await trackingModelForecast(configuration, "Exact prompt", Date.now() + 10000),
  ).toBeGreaterThan(1.02);
  await expect(
    trackingModelForecast(
      { ...configuration, parameters: { max_output_tokens: 512 } },
      "Exact prompt",
      Date.now() + 10000,
    ),
  ).rejects.toThrow(/versioned consent/);
});
it("fails closed for unavailable or stale official prices and unsupported engine pricing", async () => {
  official.fetch.mockResolvedValueOnce(new Map());
  await expect(
    trackingModelForecast(configuration, "Exact prompt", Date.now() + 10000),
  ).rejects.toThrow(/prices/);
  await expect(
    trackingModelForecast(
      { ...configuration, engine: "gemini" },
      "Exact prompt",
      Date.now() + 10000,
    ),
  ).rejects.toThrow(/engine/);
  expect(() =>
    trackingPriceBound(
      { ...configuration, source: "consumer_scrape" },
      Date.parse("2026-12-01T12:00:00Z"),
    ),
  ).toThrow(/stale/);
});
it("treats the advisory limit as a forecast check rather than a provider maximum", async () => {
  await expect(
    trackingModelForecast(
      {
        ...configuration,
        parameters: { ...configuration.parameters, estimated_cost_limit_cents: 0.1 },
      },
      "Exact prompt",
      Date.now() + 10000,
    ),
  ).rejects.toThrow(/advisory/);
});
it("includes the documented Google search-operator multiplier in admission", async () => {
  const google = {
    ...configuration,
    source: "google_aio" as const,
    engine: "google" as const,
    endpoint: "serp/google/organic/task_post",
    model: null,
    parameters: { language_code: "en", location_code: 2840 },
  };
  expect(await trackingModelForecast(google, "Exact prompt", Date.now() + 1000)).toBe(0.12);
  expect(await trackingModelForecast(google, "site:example.com", Date.now() + 1000)).toBe(0.6);
});
