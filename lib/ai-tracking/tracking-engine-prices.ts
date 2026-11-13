import "server-only";
import { trackingPriceBound } from "@/lib/ai-tracking/admission/pricing";
import type {
  SourceConfiguration,
  TrackingEngine,
  TrackingSource,
} from "@/lib/ai-tracking/contract";
import {
  type TrackingEnginePriceCard,
  trackingPromptEngines,
  trackingSourceForEngine,
} from "@/lib/ai-tracking/tracking-engines";

/**
 * Local price bound for one engine. Model API needs a network rate card, and a stale
 * bound is not an estimate, so both return null instead of a price.
 */
export function trackingEngineEstimateUsd(engine: string, now = Date.now()): number | null {
  if (!trackingPromptEngines().includes(engine as TrackingEngine)) return null;
  const resolved = engine as TrackingEngine;
  const source = trackingSourceForEngine(resolved);
  if (source === "model_api") return null;
  try {
    return trackingPriceBound(queuedConfiguration(resolved, source), now);
  } catch {
    return null;
  }
}

/** Sum of local bounds. Missing any engine's bound hides the whole line. */
export function trackingSelectionEstimateUsd(
  engines: readonly string[],
  now = Date.now(),
): number | null {
  if (!engines.length) return null;
  let total = 0;
  for (const engine of engines) {
    const price = trackingEngineEstimateUsd(engine, now);
    if (price === null) return null;
    total += price;
  }
  return total;
}

/** Default run is one consumer ChatGPT check per active prompt, when that bound is fresh. */
export function defaultPromptRunEstimateUsd(promptCount: number, now = Date.now()): number | null {
  if (promptCount <= 0) return null;
  const each = trackingEngineEstimateUsd("chat_gpt", now);
  if (each === null) return null;
  return each * promptCount;
}

/** Plain data for client labels. The browser never imports the rate card. */
export function trackingEnginePriceCard(now = Date.now()): TrackingEnginePriceCard {
  const usdByEngine: TrackingEnginePriceCard["usdByEngine"] = {};
  for (const engine of trackingPromptEngines()) {
    const usd = trackingEngineEstimateUsd(engine, now);
    if (usd !== null) usdByEngine[engine] = usd;
  }
  return { usdByEngine };
}

function queuedConfiguration(engine: TrackingEngine, source: TrackingSource): SourceConfiguration {
  return {
    endpoint:
      source === "google_aio"
        ? "serp/google/organic/task_post"
        : `ai_optimization/${engine}/llm_scraper/task_post`,
    engine,
    model: null,
    parameters: {},
    provider: "dataforseo",
    source,
  };
}
