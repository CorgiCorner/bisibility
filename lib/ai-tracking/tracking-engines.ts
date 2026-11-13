import {
  TRACKING_ENGINES,
  TRACKING_SOURCES,
  type TrackingEngine,
  type TrackingSource,
} from "@/lib/ai-tracking/contract";

/**
 * Client-safe engine catalog. Price bounds live in `tracking-engine-prices.ts`
 * and reach the browser only as a TrackingEnginePriceCard.
 */

/** Engines the tracking run form can actually ask for a source. */
export function trackingEngines(source: TrackingSource): TrackingEngine[] {
  if (source === "google_aio") return ["google"];
  if (source === "consumer_scrape") return ["chat_gpt", "gemini"];
  return ["chat_gpt"];
}

/** Union of `trackingEngines` across every tracking source. */
export function trackingPromptEngines(): TrackingEngine[] {
  const supported = new Set<TrackingEngine>();
  for (const source of TRACKING_SOURCES) {
    for (const engine of trackingEngines(source)) supported.add(engine);
  }
  return TRACKING_ENGINES.filter((engine) => supported.has(engine));
}

/** First source whose form offers this engine. Model API is last so ChatGPT stays on the scraper. */
export function trackingSourceForEngine(engine: TrackingEngine): TrackingSource {
  for (const source of TRACKING_SOURCES) {
    if (trackingEngines(source).includes(engine)) return source;
  }
  return "consumer_scrape";
}

/** Serializable per-engine bounds. A missing engine means the cost stays hidden. */
export type TrackingEnginePriceCard = {
  usdByEngine: Partial<Record<TrackingEngine, number>>;
};

export const EMPTY_TRACKING_ENGINE_PRICES: TrackingEnginePriceCard = { usdByEngine: {} };

export function trackingEngineEstimateFromCard(
  prices: TrackingEnginePriceCard,
  engine: string,
): number | null {
  if (!trackingPromptEngines().includes(engine as TrackingEngine)) return null;
  return prices.usdByEngine[engine as TrackingEngine] ?? null;
}

export function trackingSelectionEstimateFromCard(
  prices: TrackingEnginePriceCard,
  engines: readonly string[],
): number | null {
  if (!engines.length) return null;
  let total = 0;
  for (const engine of engines) {
    const price = trackingEngineEstimateFromCard(prices, engine);
    if (price === null) return null;
    total += price;
  }
  return total;
}

export function defaultPromptRunEstimateFromCard(
  prices: TrackingEnginePriceCard,
  promptCount: number,
): number | null {
  if (promptCount <= 0) return null;
  const each = trackingEngineEstimateFromCard(prices, "chat_gpt");
  if (each === null) return null;
  return each * promptCount;
}
