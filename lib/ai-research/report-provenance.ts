import type { ReportJson } from "@/lib/agent-reports/model";
import { ACTUAL_COST_ASSUMPTIONS, ACTUAL_COST_EXCLUSIONS, modelForecast } from "./actual-cost";
import type { AiAdmission } from "./admission";
import { admissionRate } from "./admission";
import { modelAdmissionBound } from "./cost";
import { AI_REQUEST_BUDGET_MS } from "./deadline";
import { engineResponsePath } from "./engines";
import {
  isLegacyModel,
  LEGACY_PRICING_CHECKED_AT,
  LEGACY_PROMPT_PRICING,
  legacyModelAdmissionBound,
} from "./legacy";
import { PROMPT_PATH, VISIBILITY_PATH } from "./provider";
import type { AiResearchKind, PromptInput, VisibilityInput } from "./schema";
import type { AiResearchRow } from "./types";
import { AiResearchValidationError } from "./validation";

export function researchProvenance({
  kind,
  input,
  admission,
  estimate,
  deadlineAt,
  providerRequestIds,
  providerId,
  rows,
}: {
  kind: AiResearchKind;
  input: PromptInput | VisibilityInput;
  admission: AiAdmission;
  estimate: number;
  deadlineAt: number;
  providerRequestIds: string[];
  providerId: string;
  rows?: readonly AiResearchRow[];
}): Record<string, ReportJson> {
  const evidence = kind === "ai_visibility" ? "observed_dataset" : "synthetic_prompt_test";
  const capabilities = "capabilities" in admission ? admission.capabilities : null;
  const engines = admission.policy === "measured_engines" ? admission.engines : null;
  const actual = admission.policy === "provider_actual_cost";
  const rate = admissionRate(admission, kind, estimate);
  return {
    pricingPolicy: admission.policy,
    isPartialEstimate: actual,
    costPolicy: actual ? "provider_actual_cost" : "hard_cap",
    isGuaranteedMaximum:
      admission.policy === "current_catalog" || admission.policy === "measured_engines",
    ...(actual && "prompt" in input
      ? {
          acknowledgement: input.actual_cost_acknowledgement ?? null,
          estimatedCostLimitCents: input.estimated_cost_limit_cents ?? null,
          forecastAssumptions: ACTUAL_COST_ASSUMPTIONS,
          forecastExclusions: ACTUAL_COST_EXCLUSIONS,
        }
      : {}),
    executionBudgetMs: AI_REQUEST_BUDGET_MS,
    deadlineReached: Date.now() >= deadlineAt,
    pricingCheckedAt: rate.checkedAt,
    pricingSource: rate.sourceUrl,
    providerRequestIds,
    ...(rows
      ? {
          modelObservations: rows.map((row) => ({
            requestedModel: row.requestedModel ?? null,
            actualModel: row.actualModel === undefined ? row.model : row.actualModel,
          })),
        }
      : {}),
    ...("prompt" in input && engines
      ? {
          // ADR-023: measured bounds, never official token rates, price engine-mode runs.
          modelPricing: engines.map((entry) => ({
            engine: entry.engine,
            model: entry.model,
            measuredAt: entry.measuredAt,
            admissionBoundCents: entry.costCents,
            outputTokens: entry.outputTokens,
            reasoning: entry.reasoning,
            webSearch: entry.engine === "perplexity" || input.web_search,
          })),
        }
      : "prompt" in input
        ? {
            modelPricing: input.models.map((model) => {
              if (!capabilities) {
                if (!isLegacyModel(model))
                  throw new AiResearchValidationError(
                    "unsupported_model",
                    "The admitted legacy model is unavailable.",
                  );
                return {
                  model,
                  ...LEGACY_PROMPT_PRICING[model],
                  checkedAt: LEGACY_PRICING_CHECKED_AT,
                  admissionBoundCents: legacyModelAdmissionBound(model),
                  outputTokens: 512,
                  reasoning: false,
                  webSearch: false,
                };
              }
              const rate = capabilities.modelRates.get(model);
              if (!rate)
                throw new AiResearchValidationError(
                  "pricing_unavailable",
                  "The admitted model price is unavailable.",
                );
              return {
                model,
                inputUsdPerMillion: rate.inputUsdPerMillion,
                outputUsdPerMillion: rate.outputUsdPerMillion,
                contextTokens: rate.contextTokens,
                maxOutputTokens: rate.maxOutputTokens,
                checkedAt: rate.checkedAt,
                sourceUrl: rate.sourceUrl,
                limitsSourceUrl: rate.limitsSourceUrl ?? rate.sourceUrl,
                currencySourceUrl: rate.currencySourceUrl ?? rate.sourceUrl,
                webSearchMaxCostCents: rate.webSearchMaxCostCents ?? null,
                ...(actual
                  ? {
                      forecastCents: modelForecast(model, input, capabilities),
                      pricingNotes: rate.pricingNotes ?? [],
                      forecastAssumptions: rate.forecastAssumptions ?? [],
                    }
                  : { admissionBoundCents: modelAdmissionBound(model, input, capabilities) }),
                outputTokens: input.max_output_tokens,
                reasoning:
                  capabilities.catalog.models.find((entry) => entry.id === model)?.reasoning ??
                  false,
                webSearch: input.web_search,
              };
            }),
          }
        : capabilities
          ? { ...capabilities.visibilityPricing }
          : { requestCostCents: 10, rowCostCents: 0.1 }),
    ...(actual ? { forecastCents: estimate } : { admissionBoundCents: estimate }),
    provider: providerId,
    endpoint:
      kind === "ai_visibility"
        ? VISIBILITY_PATH
        : engines
          ? engines.map((entry) => engineResponsePath(entry.engine))
          : PROMPT_PATH,
    evidence,
    scope: kind === "ai_visibility" ? "provider_dataset_only" : "synthetic_only",
    webSearch: "prompt" in input && input.web_search,
  };
}
