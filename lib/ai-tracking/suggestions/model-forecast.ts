import type { AiResearchCapabilities } from "@/lib/ai-research/catalog";
import { isFreshOfficialPrice } from "@/lib/ai-research/cost";
import { payloadHash } from "@/lib/ai-tracking/identity";
import {
  type SuggestionGenerationConfiguration,
  SuggestionGenerationError,
  type SuggestionGenerationSnapshot,
} from "./generation-schema";
import { GENERATION_INSTRUCTION_VERSION, generationPayload } from "./model-payload";

export const GENERATION_LIMITATIONS = [
  "Model-generated hypotheses are not measured demand, popularity or provider-dataset evidence.",
  "The forecast includes all reviewed context, instructions and requested output using UTF-8 bytes as approximate input tokens; provider tokenization and role serialization may differ.",
  "This advisory estimate is not a guaranteed maximum. Reasoning or provider overhead may exceed it; the actual native provider receipt determines the charge.",
  "Web search is disabled. The country is reviewed context, not a dataset filter or verified response location.",
  "Acceptance saves editable drafts and their provenance; it does not run a tracking baseline.",
];
export function forecastGeneration(
  configuration: SuggestionGenerationConfiguration,
  snapshot: SuggestionGenerationSnapshot,
  capabilities: AiResearchCapabilities,
) {
  const capability = capabilities.catalog.models.find((model) => model.id === configuration.model);
  if (!capability)
    throw new SuggestionGenerationError(
      422,
      "unsupported_model",
      "The selected model is absent from the current provider catalog.",
    );
  if (
    !capability.actualCostEnabled ||
    configuration.maxOutputTokens < capability.minOutputTokens ||
    configuration.maxOutputTokens > capability.maxOutputTokens
  )
    throw new SuggestionGenerationError(
      422,
      "unsupported_model_options",
      "The verified model does not support the selected actual-cost output limit.",
    );
  if (
    !capabilities.catalog.responseLanguages.some(
      (language) => language.code === configuration.languageCode,
    )
  )
    throw new SuggestionGenerationError(
      422,
      "unsupported_language",
      "The selected response language is unavailable.",
    );
  if (
    configuration.countryIsoCode &&
    !capabilities.catalog.responseCountries.some(
      (country) => country.code === configuration.countryIsoCode,
    )
  )
    throw new SuggestionGenerationError(
      422,
      "unsupported_market",
      "The selected reviewed country is unavailable.",
    );
  const rate = capabilities.modelRates.get(configuration.model);
  if (
    !rate ||
    capabilities.promptBaseCostCents === null ||
    ![
      rate.sourceUrl,
      rate.currencySourceUrl ?? rate.sourceUrl,
      rate.limitsSourceUrl ?? rate.sourceUrl,
    ].every((url) => isFreshOfficialPrice(rate.checkedAt, url))
  )
    throw new SuggestionGenerationError(
      422,
      "pricing_unavailable",
      "Fresh official token and provider request pricing is required.",
    );
  const payload = generationPayload(configuration, snapshot, capability);
  const inputTokens = Buffer.byteLength(
    [
      payload.system_message,
      payload.user_prompt,
      ...payload.message_chain.map((chunk) => chunk.message),
    ].join("\n"),
    "utf8",
  );
  const cost =
    capabilities.promptBaseCostCents +
    (inputTokens * Math.max(rate.inputUsdPerMillion, rate.cachedInputUsdPerMillion ?? 0) +
      configuration.maxOutputTokens * rate.outputUsdPerMillion) /
      10000;
  if (!Number.isFinite(cost) || cost <= 0)
    throw new SuggestionGenerationError(
      422,
      "pricing_unavailable",
      "A valid official forecast is unavailable.",
    );
  const estimatedCostCents = Math.ceil(cost * 10000) / 10000;
  if (estimatedCostCents > configuration.advisoryCostLimitCents)
    throw new SuggestionGenerationError(
      422,
      "cost_limit_exceeded",
      "The full reviewed-context forecast exceeds the advisory cost limit.",
    );
  const { checkedAt: _checkedAt, ...rateIdentity } = rate;
  return {
    capability,
    estimatedCostCents,
    payload,
    pricingRevision: payloadHash([
      GENERATION_INSTRUCTION_VERSION,
      capability,
      rateIdentity,
      capabilities.promptBaseCostCents,
    ]),
  };
}
