import type { PromptInput, VisibilityInput } from "./schema";

// Retained from the approved main admission policy, not a live account quote.
export const LEGACY_PRICING_CHECKED_AT = "2026-10-02";
export const LEGACY_OUTPUT_TOKENS = 512;
export const LEGACY_MODELS = ["gpt-4.1-mini", "gpt-4.1-nano"] as const;
export const LEGACY_PROMPT_PRICING = {
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
export type LegacyPromptModel = (typeof LEGACY_MODELS)[number];

export function isLegacyModel(model: string): model is LegacyPromptModel {
  return model === "gpt-4.1-mini" || model === "gpt-4.1-nano";
}
export function isLegacyPrompt(
  input: Pick<
    PromptInput,
    "models" | "max_output_tokens" | "web_search" | "response_language" | "country_iso_code"
  > & { cost_policy?: PromptInput["cost_policy"] },
): boolean {
  return (
    (input.cost_policy === undefined || input.cost_policy === "hard_cap") &&
    input.models.length > 0 &&
    input.models.every(isLegacyModel) &&
    input.max_output_tokens === LEGACY_OUTPUT_TOKENS &&
    !input.web_search &&
    input.response_language === "en" &&
    !input.country_iso_code
  );
}
export function isLegacyVisibility(
  input: Pick<VisibilityInput, "platform" | "location_code" | "language_code">,
): boolean {
  return (
    input.platform === "chat_gpt" && input.location_code === 2840 && input.language_code === "en"
  );
}
export function legacyModelAdmissionBound(model: LegacyPromptModel): number {
  const rate = LEGACY_PROMPT_PRICING[model];
  const bound =
    0.06 +
    (rate.contextTokens * rate.inputUsdPerMillion +
      LEGACY_OUTPUT_TOKENS * rate.outputUsdPerMillion) /
      10_000;
  return Math.ceil(bound * 10_000) / 10_000;
}
