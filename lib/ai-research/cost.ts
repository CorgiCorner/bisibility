import type { ProviderFeatureRate } from "@/lib/cost-estimate/provider-rates";
import type { PromptInput, VisibilityInput } from "./schema";

export const AI_PRICING_CHECKED_AT = "2026-10-02";
export const PROMPT_OUTPUT_TOKENS = 512;
export const PROMPT_PRICING = {
  "gpt-4.1-mini": {
    contextTokens: 1_047_576,
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
    source: "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
  },
  "gpt-4.1-nano": {
    contextTokens: 1_047_576,
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.4,
    source: "https://developers.openai.com/api/docs/models/gpt-4.1-nano",
  },
} as const;
export function visibilityCost(input: VisibilityInput) {
  return 10 + input.limit * 0.1;
}
export function modelAdmissionBound(model: keyof typeof PROMPT_PRICING) {
  const rate = PROMPT_PRICING[model];
  const bound =
    0.06 +
    (rate.contextTokens * rate.inputUsdPerMillion +
      PROMPT_OUTPUT_TOKENS * rate.outputUsdPerMillion) /
      10_000;
  return Math.ceil(bound * 10_000) / 10_000;
}
export function promptCost(input: PromptInput) {
  return input.models.reduce((sum, model) => sum + modelAdmissionBound(model), 0);
}
export function aiRate(
  feature: "ai_visibility" | "prompt_explorer",
  costCents: number,
): ProviderFeatureRate {
  return {
    checkedAt: AI_PRICING_CHECKED_AT,
    costCents,
    feature,
    providerId: "dataforseo",
    sourceUrl: `https://dataforseo.com/pricing/ai-optimization/${feature === "ai_visibility" ? "llm-mentions" : "llm-responses"}`,
  };
}
