import type { AiResearchCapabilities } from "./catalog";
import type { AiModelCapability } from "./catalog-types";

// Fictional capability and price fixtures, never a captured provider account.
const stamp = new Date().toISOString();
const models: AiModelCapability[] = ["gpt-4.1-mini", "gpt-4.1-nano"].map((id) => ({
  id,
  provider: "chat_gpt",
  label: id,
  reasoning: false,
  webSearch: true,
  minOutputTokens: 16,
  maxOutputTokens: 4096,
  priceAvailable: true,
  admissionEnabled: true,
  actualCostEnabled: true,
}));
export const modelMap = new Map(models.map((model) => [model.id, model]));
export const capabilities: AiResearchCapabilities = {
  promptBaseCostCents: 0.06,
  visibilityPricing: { requestCostCents: 10, rowCostCents: 0.1 },
  pricingCheckedAt: stamp,
  modelRates: new Map(
    models.map((model, index) => [
      model.id,
      {
        inputUsdPerMillion: index === 0 ? 0.25 : 0.1,
        outputUsdPerMillion: index === 0 ? 2 : 0.4,
        contextTokens: 128_000,
        maxOutputTokens: 128_000,
        checkedAt: stamp,
        sourceUrl: "https://api.dataforseo.com/v3/appendix/user_data",
      },
    ]),
  ),
  catalog: {
    models,
    visibilityMarkets: [
      {
        platform: "chat_gpt",
        locationCode: 2840,
        countryName: "United States",
        languages: [{ code: "en", name: "English" }],
      },
      {
        platform: "google",
        locationCode: 2616,
        countryName: "Poland",
        languages: [{ code: "pl", name: "Polish" }],
      },
    ],
    responseCountries: [
      { code: "US", name: "United States" },
      { code: "PL", name: "Poland" },
    ],
    responseLanguages: [
      { code: "en", name: "English" },
      { code: "pl", name: "Polish" },
    ],
    limits: { maxModels: 2, maxOutputTokens: 4096 },
    fetchedAt: stamp,
  },
};
