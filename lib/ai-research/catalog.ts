import "server-only";
import { readBodyWithLimit } from "@/lib/http/bounded-body";
import { ProviderCallError } from "@/lib/providers/call-error";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { requireDataForSeoLogin } from "@/lib/providers/serp/dataforseo-client";
import type { ProviderCredentials } from "@/lib/providers/types";
import { serpCountryCatalog } from "@/lib/serp/country-catalog";
import { serpLanguageCatalog } from "@/lib/serp/generated/serp-language-catalog";
import { z } from "zod";
import type { AiModelRate, AiVisibilityPrice } from "./catalog-pricing";
import { parseResponsesBasePrice, parseVisibilityPrice } from "./catalog-pricing";
import type { AiResearchCatalog, AiVisibilityMarket } from "./catalog-types";
import { aiDeadlineSignal } from "./deadline";
import { isLegacyModel } from "./legacy";
import { fetchOfficialModelRates } from "./official-model-rates";

const ROOT = "https://api.dataforseo.com/v3/";
export const MODEL_CATALOG_PATH = "ai_optimization/chat_gpt/llm_responses/models";
export const VISIBILITY_CATALOG_PATH = "ai_optimization/llm_mentions/locations_and_languages";
export const PRICING_PATH = "appendix/user_data";
const model = z.object({
  model_name: z.string().min(1).max(120),
  reasoning: z.boolean(),
  web_search_supported: z.boolean(),
});
const location = z.object({
  location_code: z.number().int().positive(),
  location_name: z.string().min(1).max(150),
  available_languages: z
    .array(
      z.object({
        language_code: z.string().min(1).max(20),
        language_name: z.string().min(1).max(120),
        available_platforms: z.array(z.enum(["chat_gpt", "google"])),
      }),
    )
    .max(200),
});
const envelope = z.object({
  status_code: z.literal(20000),
  cost: z.literal(0),
  tasks_error: z.literal(0),
  tasks: z
    .array(
      z.object({
        status_code: z.literal(20000),
        cost: z.literal(0),
        result: z.array(z.unknown()).max(1000),
      }),
    )
    .length(1),
});
export type AiResearchCapabilities = {
  catalog: AiResearchCatalog;
  promptBaseCostCents: number | null;
  visibilityPricing: AiVisibilityPrice | null;
  modelRates: ReadonlyMap<string, AiModelRate>;
  pricingCheckedAt: string;
};
async function metadata(credentials: ProviderCredentials, path: string, deadline: number) {
  const limit = await consumeProviderLimit("dataforseo", credentials);
  if (!limit.success) throw new ProviderCallError("AI provider catalog is rate limited.", 0);
  const response = await fetch(`${ROOT}${path}`, {
    headers: { Authorization: requireDataForSeoLogin(credentials) },
    signal: aiDeadlineSignal(deadline, 10_000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderCallError("AI provider capabilities are unavailable.", 0);
  }
  const body = await readBodyWithLimit(response, 2 * 1024 * 1024);
  if (!body.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderCallError("AI provider catalog exceeds its size limit or is unreadable.", 0);
  }
  const value: unknown = JSON.parse(body.bytes.toString("utf8"));
  const parsed = envelope.safeParse(value);
  if (!parsed.success)
    throw new ProviderCallError("AI provider returned an invalid free catalog.", 0);
  return { value, rows: parsed.data.tasks[0].result };
}
export async function fetchAiResearchCapabilities(
  credentials: ProviderCredentials,
  deadlineAt = Date.now() + 10_000,
): Promise<AiResearchCapabilities> {
  const [models, markets, pricing] = await Promise.all([
    metadata(credentials, MODEL_CATALOG_PATH, deadlineAt),
    metadata(credentials, VISIBILITY_CATALOG_PATH, deadlineAt),
    metadata(credentials, PRICING_PATH, deadlineAt),
  ]);
  const fetchedAt = new Date().toISOString();
  const visibilityMarkets: AiVisibilityMarket[] = [];
  for (const value of z.array(location).parse(markets.rows)) {
    for (const platform of ["chat_gpt", "google"] as const) {
      const languages = value.available_languages
        .filter((language) => language.available_platforms.includes(platform))
        .map((language) => ({ code: language.language_code, name: language.language_name }));
      if (languages.length)
        visibilityMarkets.push({
          platform,
          locationCode: value.location_code,
          countryName: value.location_name,
          languages,
        });
    }
  }
  const entries = z.array(model).parse(models.rows);
  const officialRates = await fetchOfficialModelRates(
    deadlineAt,
    entries.map((entry) => entry.model_name),
  );
  const promptBaseCostCents = parseResponsesBasePrice(pricing.value);
  // Only verified non-reasoning descriptors may enable a text-only prompt run.
  const modelRates = new Map<string, AiModelRate>();
  for (const entry of entries) {
    const rate = officialRates.get(entry.model_name);
    if (rate && (rate.reasoning === undefined || rate.reasoning === entry.reasoning))
      modelRates.set(entry.model_name, rate);
  }
  const catalog: AiResearchCatalog = {
    models: entries.map((entry) => ({
      id: entry.model_name,
      provider: "chat_gpt",
      label: entry.model_name,
      reasoning: entry.reasoning,
      webSearch: entry.web_search_supported,
      minOutputTokens: entry.reasoning ? 1024 : 16,
      maxOutputTokens: 4096,
      priceAvailable: modelRates.has(entry.model_name),
      admissionEnabled: isLegacyModel(entry.model_name) && !entry.reasoning,
      actualCostEnabled: modelRates.has(entry.model_name) && promptBaseCostCents !== null,
    })),
    visibilityMarkets,
    // Local ISO names are search hints, not provider-returned dataset coverage.
    responseCountries: serpCountryCatalog.map((country) => ({
      code: country.countryCode,
      name: country.displayName,
    })),
    responseLanguages: serpLanguageCatalog.map((language) => ({
      code: language.code,
      name: language.label,
    })),
    limits: { maxModels: 2, maxOutputTokens: 4096 },
    fetchedAt,
  };
  return {
    catalog,
    promptBaseCostCents,
    visibilityPricing: parseVisibilityPrice(pricing.value),
    modelRates,
    pricingCheckedAt: fetchedAt,
  };
}
