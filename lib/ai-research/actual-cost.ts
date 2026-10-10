import { createHash } from "node:crypto";
import type { AiResearchCapabilities } from "./catalog";
import { isFreshOfficialPrice } from "./cost";
import type { PromptInput } from "./schema";
import { AiResearchValidationError } from "./validation";

export const ACTUAL_COST_EXCLUSIONS = [
  "search_tool_fees",
  "repeated_tool_calls",
  "retrieved_content",
  "tool_loop_input",
  "provider_role_serialization",
  "regional_and_cache_write_surcharges",
];
export const ACTUAL_COST_ASSUMPTIONS = [
  "Standard processing, uncached input and short context; no regional or cache-write surcharge is included.",
  "Input forecast uses UTF-8 bytes as approximate tokens, including the language instruction; provider tokenization and serialization/role overhead may differ.",
  "Output forecast uses the requested output length. Reasoning and search can exceed it.",
  "Search tool fees, repeated tool calls and accumulated tool-loop input are not bounded or included. The provider's actual receipt determines the charge.",
  "The advisory limit is not a guaranteed maximum; an in-flight request may exceed it.",
];

export function credentialReference(connection: {
  id: string;
  credentialSource?: string;
  credentialsEncrypted?: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([connection.id, connection.credentialSource, connection.credentialsEncrypted]),
    )
    .digest("hex");
}

export function modelForecast(
  model: string,
  input: PromptInput,
  capabilities: AiResearchCapabilities,
): number {
  const capability = capabilities.catalog.models.find((entry) => entry.id === model);
  if (!capability)
    throw new AiResearchValidationError(
      "unsupported_model",
      "The model is absent from the provider's current catalog.",
    );
  if (
    input.max_output_tokens < capability.minOutputTokens ||
    input.max_output_tokens > capability.maxOutputTokens ||
    (input.web_search && !capability.webSearch) ||
    (input.country_iso_code && /^(?:o3-mini|o1-pro|o1)(?:-\d{4}-\d{2}-\d{2})?$/.test(model))
  )
    throw new AiResearchValidationError(
      "unsupported_model_options",
      "The selected model does not support these output or search country options.",
    );
  const rate = capabilities.modelRates.get(model);
  if (
    !rate ||
    !isFreshOfficialPrice(rate.checkedAt, rate.sourceUrl) ||
    !isFreshOfficialPrice(rate.checkedAt, rate.currencySourceUrl ?? rate.sourceUrl) ||
    !isFreshOfficialPrice(rate.checkedAt, rate.limitsSourceUrl ?? rate.sourceUrl) ||
    capabilities.promptBaseCostCents === null
  )
    throw new AiResearchValidationError(
      "pricing_unavailable",
      "Fresh official token rates and current provider request pricing are required for this forecast.",
    );
  const inputTokens = new TextEncoder().encode(
    `${input.prompt}\nRespond in language ${input.response_language}. This is a response instruction, not a dataset filter.`,
  ).length;
  const forecast =
    capabilities.promptBaseCostCents +
    (inputTokens * Math.max(rate.inputUsdPerMillion, rate.cachedInputUsdPerMillion ?? 0) +
      input.max_output_tokens * rate.outputUsdPerMillion) /
      10_000;
  if (!Number.isFinite(forecast) || forecast <= 0)
    throw new AiResearchValidationError(
      "pricing_unavailable",
      "A valid official forecast is unavailable.",
    );
  return Math.ceil(forecast * 10_000) / 10_000;
}
