import type { ProviderFeatureRate } from "@/lib/cost-estimate/provider-rates";
import type { AiResearchCapabilities } from "./catalog";
import { catalogAdmissionBound } from "./catalog-pricing";
import type { PromptInput, VisibilityInput } from "./schema";
import { AiResearchValidationError } from "./validation";

export function visibilityCost(input: VisibilityInput, capabilities: AiResearchCapabilities) {
  const rate = capabilities.visibilityPricing;
  if (!rate)
    throw new AiResearchValidationError(
      "pricing_unavailable",
      "Current provider account pricing for visibility rows is unavailable. Analysis cannot run without a verified cost estimate.",
    );
  return rate.requestCostCents + input.limit * rate.rowCostCents;
}
export function modelAdmissionBound(
  model: string,
  input: PromptInput,
  capabilities: AiResearchCapabilities,
) {
  const capability = capabilities.catalog.models.find((entry) => entry.id === model);
  if (!capability)
    throw new AiResearchValidationError(
      "unsupported_model",
      "The selected model is absent from the provider's current catalog.",
    );
  if (input.web_search && !capability.webSearch)
    throw new AiResearchValidationError(
      "unsupported_web_search",
      "The selected model does not support web search.",
    );
  const rate = capabilities.modelRates.get(model);
  if (
    !rate ||
    !isFreshOfficialPrice(rate.checkedAt, rate.sourceUrl) ||
    (rate.limitsSourceUrl && !isFreshOfficialPrice(rate.checkedAt, rate.limitsSourceUrl)) ||
    (rate.currencySourceUrl && !isFreshOfficialPrice(rate.checkedAt, rate.currencySourceUrl))
  )
    throw new AiResearchValidationError(
      "pricing_unavailable",
      "The model price must be fresh and come from a verified official source.",
    );
  const bound = catalogAdmissionBound(
    { reasoning: capability.reasoning, web_search_supported: capability.webSearch },
    input,
    capabilities.promptBaseCostCents,
    rate,
  );
  if (bound === null)
    throw new AiResearchValidationError(
      "pricing_unavailable",
      "A verified complete price for model tokens and paid search is unavailable. A total cost bound is required before this model can run.",
    );
  return bound;
}
export function promptCost(input: PromptInput, capabilities: AiResearchCapabilities) {
  return input.models.reduce(
    (sum, model) => sum + modelAdmissionBound(model, input, capabilities),
    0,
  );
}
export function aiRate(
  feature: "ai_visibility" | "prompt_explorer",
  costCents: number,
  checkedAt: string,
): ProviderFeatureRate {
  return {
    checkedAt: checkedAt.slice(0, 10),
    costCents,
    feature,
    providerId: "dataforseo",
    sourceUrl: "https://docs.dataforseo.com/v3/appendix/user_data/",
  };
}

export function isFreshOfficialPrice(checkedAt: string, sourceUrl: string, now = Date.now()) {
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked) || checked > now || now - checked > 300_000) return false;
  try {
    const source = new URL(sourceUrl);
    return (
      !source.username &&
      !source.password &&
      [
        "https://api.dataforseo.com",
        "https://docs.dataforseo.com",
        "https://dataforseo.com",
        "https://api.openai.com",
        "https://platform.openai.com",
        "https://developers.openai.com",
        "https://openai.com",
      ].includes(source.origin)
    );
  } catch {
    return false;
  }
}
