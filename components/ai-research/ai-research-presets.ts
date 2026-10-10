import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import {
  isLegacyPrompt,
  LEGACY_MODELS,
  LEGACY_OUTPUT_TOKENS,
  LEGACY_PRICING_CHECKED_AT,
} from "@/lib/ai-research/legacy";
import type { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import type { z } from "zod";

type FormValues = z.input<typeof promptSchema | typeof visibilitySchema>;
export const legacyVisibilityMarket = {
  platform: "chat_gpt" as const,
  locationCode: 2840,
  countryName: "United States",
  languages: [{ code: "en", name: "English" }],
};
export const legacyModelOptions = LEGACY_MODELS.map((id) => ({
  value: id,
  label: id === "gpt-4.1-mini" ? "GPT-4.1 mini" : "GPT-4.1 nano",
}));
export function freshResearchCatalog(catalog?: AiResearchCatalog, error?: string) {
  if (!catalog || error) return undefined;
  const age = Date.now() - Date.parse(catalog.fetchedAt);
  return Number.isFinite(age) && age >= 0 && age <= 300_000 ? catalog : undefined;
}
export function legacyResearchInput(mode: "prompt" | "visibility", values: FormValues) {
  if (mode === "visibility")
    return (
      "platform" in values &&
      values.platform === "chat_gpt" &&
      values.location_code === 2840 &&
      values.language_code === "en"
    );
  return (
    "models" in values &&
    isLegacyPrompt({
      models: values.models ?? [],
      max_output_tokens: values.max_output_tokens ?? LEGACY_OUTPUT_TOKENS,
      web_search: values.web_search ?? false,
      response_language: values.response_language ?? "en",
      country_iso_code: values.country_iso_code,
      cost_policy: values.cost_policy,
    })
  );
}
export function researchInputFingerprint(
  mode: "prompt" | "visibility",
  values: FormValues,
  catalog?: AiResearchCatalog,
) {
  const { estimate_only: _estimate, ...request } = values;
  const identity = { ...request };
  if ("idempotency_key" in identity) delete identity.idempotency_key;
  if ("estimate_credentials_ref" in identity) delete identity.estimate_credentials_ref;
  const catalogVersion = legacyResearchInput(mode, values)
    ? LEGACY_PRICING_CHECKED_AT
    : catalog?.fetchedAt;
  return JSON.stringify({ identity, catalogVersion });
}

export function extendedPromptAvailable(
  catalog: AiResearchCatalog | undefined,
  values: FormValues,
) {
  return (
    "models" in values &&
    (values.cost_policy !== "provider_actual_cost"
      ? !values.web_search
      : catalog?.actualCostAvailable === true &&
        values.actual_cost_acknowledgement === "non_guaranteed_estimate_v1") &&
    Boolean(values.models?.length) &&
    values.models?.every((id) =>
      catalog?.models.some(
        (model) =>
          model.id === id &&
          (values.cost_policy === "provider_actual_cost"
            ? model.actualCostEnabled && (!values.web_search || model.webSearch)
            : model.priceAvailable && model.admissionEnabled),
      ),
    ) === true
  );
}
