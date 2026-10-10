export type AiModelCapability = {
  id: string;
  provider: "chat_gpt";
  label: string;
  reasoning: boolean;
  webSearch: boolean;
  minOutputTokens: number;
  maxOutputTokens: number;
  priceAvailable: boolean;
  admissionEnabled: boolean;
  actualCostEnabled: boolean;
};
export type AiVisibilityMarket = {
  platform: "chat_gpt" | "google";
  locationCode: number;
  countryName: string;
  languages: { code: string; name: string }[];
};
export type AiResearchCatalog = {
  models: AiModelCapability[];
  visibilityMarkets: AiVisibilityMarket[];
  responseCountries: { code: string; name: string }[];
  responseLanguages: { code: string; name: string }[];
  limits: { maxModels: 2; maxOutputTokens: 4096 };
  fetchedAt: string;
  actualCostAvailable?: boolean;
};
export type AiCatalogOutcome =
  | { ok: true; catalog: AiResearchCatalog }
  | { ok: false; message: string };
