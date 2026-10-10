import { isFreshOfficialPrice } from "@/lib/ai-research/cost";
import { fetchOfficialModelRates } from "@/lib/ai-research/official-model-rates";
import type { SourceConfiguration } from "@/lib/ai-tracking/contract";

export const TRACKING_PRICE_CHECKED_AT = "2026-10-08T00:00:00Z";
export const TRACKING_PRICE_MAX_AGE_MS = 30 * 86400_000;
export const RESPONSES_BASE_USD = { queued: 0.0002, live: 0.0006 };
export const TRACKING_PRICE_SOURCES = [
  "https://dataforseo.com/pricing/ai-optimization/llm-responses",
  "https://dataforseo.com/pricing/ai-optimization/llm-scraper",
  "https://dataforseo.com/pricing/serp/google-organic-serp-api",
];
function assertTrackingPriceFresh(now = Date.now()) {
  const age = now - Date.parse(TRACKING_PRICE_CHECKED_AT);
  if (age < 0 || age > TRACKING_PRICE_MAX_AGE_MS)
    throw new Error("Tracking price verification is stale.");
}
export function trackingPriceBound(configuration: SourceConfiguration, now = Date.now()) {
  assertTrackingPriceFresh(now);
  const queued = configuration.endpoint.endsWith("task_post");
  if (configuration.source === "consumer_scrape") return queued ? 0.12 : 0.4;
  if (configuration.source === "google_aio") return queued ? 0.12 : 0.4;
  throw new Error("Responses requires a fresh official token-price forecast.");
}
export async function trackingModelForecast(
  configuration: SourceConfiguration,
  prompt: string,
  deadline: number,
) {
  assertTrackingPriceFresh();
  if (configuration.source !== "model_api") {
    const searchOperator =
      /(?:allinanchor|allintext|allintitle|allinurl|define|filetype|id|inanchor|info|intext|intitle|inurl|link|site):/i;
    const multiplier = configuration.source === "google_aio" && searchOperator.test(prompt) ? 5 : 1;
    return trackingPriceBound(configuration) * multiplier;
  }
  if (
    configuration.parameters.cost_policy !== "provider_actual_cost" ||
    configuration.parameters.actual_cost_acknowledgement !== "non_guaranteed_estimate_v1"
  )
    throw new Error(
      "Responses requires versioned consent to actual provider cost without a guaranteed maximum.",
    );
  const advisory = configuration.parameters.estimated_cost_limit_cents;
  if (typeof advisory !== "number" || !Number.isFinite(advisory) || advisory <= 0)
    throw new Error("Responses requires a positive advisory estimate limit.");
  if (configuration.engine !== "chat_gpt" || !configuration.model)
    throw new Error("Fresh official token prices are unavailable for this engine.");
  const rate = (await fetchOfficialModelRates(deadline, [configuration.model])).get(
    configuration.model,
  );
  if (
    !rate ||
    !isFreshOfficialPrice(rate.checkedAt, rate.sourceUrl) ||
    !isFreshOfficialPrice(rate.checkedAt, rate.limitsSourceUrl ?? rate.sourceUrl)
  )
    throw new Error("Fresh official model prices are unavailable.");
  const tokens = Number(configuration.parameters.max_output_tokens);
  if (tokens > rate.maxOutputTokens || (rate.reasoning && tokens < 1024))
    throw new Error("Requested output exceeds current model capability.");
  const queued = configuration.endpoint.endsWith("task_post");
  const forecast =
    (queued ? 0.02 : 0.06) +
    (Buffer.byteLength(prompt, "utf8") * rate.inputUsdPerMillion +
      tokens * rate.outputUsdPerMillion) /
      10_000;
  if (!Number.isFinite(forecast) || forecast > advisory)
    throw new Error("Tracking forecast exceeds the advisory estimate limit.");
  return Math.max(queued ? 1.02 : 0, Math.ceil(forecast * 10_000) / 10_000);
}
