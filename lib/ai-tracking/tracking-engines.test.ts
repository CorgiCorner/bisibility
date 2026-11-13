import { describe, expect, it } from "vitest";
import {
  defaultPromptRunEstimateFromCard,
  trackingEngineEstimateFromCard,
  trackingPromptEngines,
  trackingSelectionEstimateFromCard,
  trackingSourceForEngine,
} from "./tracking-engines";

const prices = { usdByEngine: { chat_gpt: 0.12, gemini: 0.12, google: 0.12 } };

describe("tracking engines", () => {
  it("offers only the engines the tracking form can run", () => {
    expect(trackingPromptEngines()).toEqual(["chat_gpt", "gemini", "google"]);
    expect(trackingSourceForEngine("chat_gpt")).toBe("consumer_scrape");
    expect(trackingSourceForEngine("gemini")).toBe("consumer_scrape");
    expect(trackingSourceForEngine("google")).toBe("google_aio");
  });

  it("totals a passed-in card and hides a missing bound", () => {
    expect(trackingEngineEstimateFromCard(prices, "gemini")).toBe(0.12);
    expect(trackingEngineEstimateFromCard(prices, "perplexity")).toBeNull();
    expect(trackingSelectionEstimateFromCard(prices, ["chat_gpt", "gemini"])).toBe(0.24);
    expect(trackingSelectionEstimateFromCard(prices, ["chat_gpt", "perplexity"])).toBeNull();
    expect(trackingSelectionEstimateFromCard(prices, [])).toBeNull();
    expect(defaultPromptRunEstimateFromCard(prices, 2)).toBe(0.24);
    expect(defaultPromptRunEstimateFromCard(prices, 0)).toBeNull();
    expect(defaultPromptRunEstimateFromCard({ usdByEngine: {} }, 2)).toBeNull();
  });
});
