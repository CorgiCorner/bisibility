import type { ProviderFeatureRate } from "@/lib/cost-estimate/provider-rates";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { credentialReference, modelForecast } from "./actual-cost";
import type { AiResearchCapabilities } from "./catalog";
import { loadAiResearchCapabilities } from "./catalog-service";
import type { requireAiSource } from "./context";
import { aiRate, modelAdmissionBound, promptCost, visibilityCost } from "./cost";
import {
  isLegacyModel,
  isLegacyPrompt,
  isLegacyVisibility,
  LEGACY_PRICING_CHECKED_AT,
  legacyModelAdmissionBound,
} from "./legacy";
import type { AiResearchKind, PromptInput, VisibilityInput } from "./schema";
import { AiResearchValidationError } from "./validation";

export type AiAdmission =
  | { policy: "legacy_dated"; estimate: number }
  | { policy: "current_catalog"; estimate: number; capabilities: AiResearchCapabilities }
  | {
      policy: "provider_actual_cost";
      estimate: number;
      capabilities: AiResearchCapabilities;
      credentialReference: string;
    };

export async function loadAiAdmission(
  source: Awaited<ReturnType<typeof requireAiSource>>,
  input: PromptInput | VisibilityInput,
  deadlineAt: number,
): Promise<AiAdmission> {
  const actual = "prompt" in input && input.cost_policy === "provider_actual_cost";
  if (actual && source.connection.credentialSource !== "own")
    throw new AiResearchValidationError(
      "own_credentials_required",
      "Actual-cost execution requires your own provider credentials; credits and hosted fallback are unavailable.",
    );
  if (
    actual &&
    !input.estimate_only &&
    input.estimate_credentials_ref !== credentialReference(source.connection)
  )
    throw new AiResearchValidationError(
      "credentials_changed",
      "The provider credential identity changed after the estimate. Obtain a new estimate before execution.",
    );
  if ("prompt" in input && isLegacyPrompt(input)) {
    const estimate = input.models.reduce((sum, model) => sum + legacyBound(model), 0);
    return { policy: "legacy_dated", estimate };
  }
  if (!("prompt" in input) && isLegacyVisibility(input))
    return { policy: "legacy_dated", estimate: 10 + input.limit * 0.1 };
  if ("prompt" in input && !actual && input.models.some((model) => !isLegacyModel(model)))
    throw new AiResearchValidationError(
      "model_not_enabled",
      "Additional model IDs require explicit own-BYOK actual-cost consent; they cannot use the hard-cap billing policy.",
    );
  if ("prompt" in input && !actual && input.web_search)
    throw new AiResearchValidationError(
      "web_search_not_enabled",
      "Web search requires explicit own-BYOK actual-cost consent; it cannot use the hard-cap billing policy.",
    );
  let capabilities: AiResearchCapabilities;
  try {
    capabilities = await loadAiResearchCapabilities(
      source,
      Math.min(deadlineAt, Date.now() + 10_000),
    );
  } catch (error) {
    if (error instanceof ProviderLookupSignal) throw error;
    throw new AiResearchValidationError(
      "pricing_unavailable",
      "Fresh extended-option pricing and catalog data are unavailable. The original 512-token mini/nano preset remains available.",
    );
  }
  if ("prompt" in input) {
    if (
      !capabilities.catalog.responseLanguages.some(
        (language) => language.code === input.response_language,
      )
    )
      throw new AiResearchValidationError(
        "unsupported_language",
        "The selected response language is unavailable.",
      );
    if (
      input.country_iso_code &&
      !capabilities.catalog.responseCountries.some(
        (country) => country.code === input.country_iso_code,
      )
    )
      throw new AiResearchValidationError(
        "unsupported_market",
        "The selected web search country hint is unavailable.",
      );
    return actual
      ? {
          policy: "provider_actual_cost",
          estimate: input.models.reduce(
            (sum, model) => sum + modelForecast(model, input, capabilities),
            0,
          ),
          capabilities,
          credentialReference: credentialReference(source.connection),
        }
      : { policy: "current_catalog", estimate: promptCost(input, capabilities), capabilities };
  }
  const market = capabilities.catalog.visibilityMarkets.find(
    (entry) => entry.platform === input.platform && entry.locationCode === input.location_code,
  );
  if (!market?.languages.some((language) => language.code === input.language_code))
    throw new AiResearchValidationError(
      "unsupported_market",
      "This platform, country and language combination is absent from the provider's current dataset catalog.",
    );
  return { policy: "current_catalog", estimate: visibilityCost(input, capabilities), capabilities };
}
function legacyBound(model: string): number {
  if (!isLegacyModel(model))
    throw new AiResearchValidationError(
      "unsupported_model",
      "The selected model is not part of the legacy preset.",
    );
  return legacyModelAdmissionBound(model);
}
export function admittedModelCost(
  admission: AiAdmission,
  model: string,
  input: PromptInput,
): number {
  return admission.policy === "legacy_dated"
    ? legacyBound(model)
    : admission.policy === "provider_actual_cost"
      ? modelForecast(model, input, admission.capabilities)
      : modelAdmissionBound(model, input, admission.capabilities);
}
export function admissionRate(
  admission: AiAdmission,
  kind: AiResearchKind,
  costCents: number,
): ProviderFeatureRate {
  return admission.policy === "legacy_dated"
    ? {
        checkedAt: LEGACY_PRICING_CHECKED_AT,
        costCents,
        feature: kind,
        providerId: "dataforseo",
        sourceUrl: `https://dataforseo.com/pricing/ai-optimization/${kind === "ai_visibility" ? "llm-mentions" : "llm-responses"}`,
      }
    : aiRate(kind, costCents, admission.capabilities.pricingCheckedAt);
}
