import { TRACKING_PRICE_CHECKED_AT } from "@/lib/ai-tracking/admission/pricing";
import { describe, expect, it } from "vitest";
import {
  defaultPromptRunEstimateUsd,
  trackingEngineEstimateUsd,
  trackingEnginePriceCard,
  trackingSelectionEstimateUsd,
} from "./tracking-engine-prices";
import {
  defaultPromptRunEstimateFromCard,
  trackingSelectionEstimateFromCard,
} from "./tracking-engines";

const fresh = Date.parse(TRACKING_PRICE_CHECKED_AT);
const stale = Date.parse("2026-11-10T00:00:00.000Z");

describe("tracking engine prices", () => {
  it("prices a fresh local bound and hides a stale or unsupported one", () => {
    expect(trackingEngineEstimateUsd("gemini", fresh)).toBe(0.12);
    expect(trackingEngineEstimateUsd("google", fresh)).toBe(0.12);
    expect(trackingEngineEstimateUsd("perplexity", fresh)).toBeNull();
    expect(trackingEngineEstimateUsd("claude", fresh)).toBeNull();
    expect(trackingEngineEstimateUsd("chat_gpt", stale)).toBeNull();
    expect(trackingSelectionEstimateUsd(["chat_gpt", "gemini"], fresh)).toBe(0.24);
    expect(trackingSelectionEstimateUsd(["chat_gpt", "perplexity"], fresh)).toBeNull();
    expect(defaultPromptRunEstimateUsd(2, fresh)).toBe(0.24);
    expect(defaultPromptRunEstimateUsd(2, stale)).toBeNull();
    expect(defaultPromptRunEstimateUsd(0, fresh)).toBeNull();
  });

  it("builds a serializable card the client can total", () => {
    const card = trackingEnginePriceCard(fresh);
    expect(card).toEqual({ usdByEngine: { chat_gpt: 0.12, gemini: 0.12, google: 0.12 } });
    expect(defaultPromptRunEstimateFromCard(card, 2)).toBe(defaultPromptRunEstimateUsd(2, fresh));
    expect(trackingSelectionEstimateFromCard(card, ["chat_gpt", "gemini"])).toBe(
      trackingSelectionEstimateUsd(["chat_gpt", "gemini"], fresh),
    );
    expect(trackingEnginePriceCard(stale)).toEqual({ usdByEngine: {} });
  });
});
