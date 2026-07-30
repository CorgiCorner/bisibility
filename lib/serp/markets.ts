export const SERP_ENGINE = {
  id: "google",
  label: "Google",
} as const;

export const serpDepthValues = [10, 20, 50, 100] as const;
export type SerpDepth = (typeof serpDepthValues)[number];
export type SerpDevice = "desktop" | "mobile";

export const serpDeviceOptions = [
  { label: "Desktop", value: "desktop" },
  { label: "Mobile", value: "mobile" },
] as const satisfies readonly { label: string; value: SerpDevice }[];

export const serpDeviceValues = serpDeviceOptions.map((option) => option.value) as [
  SerpDevice,
  ...SerpDevice[],
];

export const serpMarketNames = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Sweden",
  "Poland",
  "Ireland",
  "Portugal",
  "Belgium",
  "Switzerland",
  "Austria",
  "Denmark",
  "Norway",
  "Finland",
  "Brazil",
  "Mexico",
  "India",
  "Japan",
  "Singapore",
  "New Zealand",
  "South Africa",
  "United Arab Emirates",
] as const;

export type SerpMarketName = (typeof serpMarketNames)[number];

export const DEFAULT_SERP_DEPTH = 100 satisfies SerpDepth;
export const DEFAULT_SERP_MARKET = "United States" satisfies SerpMarketName;
export const DEFAULT_SERP_DEVICE = "desktop" satisfies SerpDevice;
export const DEFAULT_SERP_STOP_ON_MATCH = true;

export type SerpMarket = {
  aliases: readonly string[];
  google: {
    gl: string;
  };
  language: {
    code: string;
    label: string;
  };
  name: SerpMarketName;
};

const markets = [
  market("United States", "us", "English", "en", ["US", "USA", "United States of America"]),
  market("United Kingdom", "gb", "English", "en", ["GB", "UK", "Great Britain"]),
  market("Canada", "ca", "English", "en", ["CA"]),
  market("Australia", "au", "English", "en", ["AU"]),
  market("Germany", "de", "German", "de", ["DE", "Deutschland"]),
  market("France", "fr", "French", "fr", ["FR"]),
  market("Spain", "es", "Spanish", "es", ["ES", "Espana", "España"]),
  market("Italy", "it", "Italian", "it", ["IT", "Italia"]),
  market("Netherlands", "nl", "Dutch", "nl", ["NL", "Holland"]),
  market("Sweden", "se", "Swedish", "sv", ["SE"]),
  market("Poland", "pl", "Polish", "pl", ["PL", "Polska"]),
  market("Ireland", "ie", "English", "en", ["IE"]),
  market("Portugal", "pt", "Portuguese", "pt", ["PT"]),
  market("Belgium", "be", "Dutch", "nl", ["BE"]),
  market("Switzerland", "ch", "German", "de", ["CH"]),
  market("Austria", "at", "German", "de", ["AT"]),
  market("Denmark", "dk", "Danish", "da", ["DK"]),
  market("Norway", "no", "Norwegian", "no", ["NO"]),
  market("Finland", "fi", "Finnish", "fi", ["FI"]),
  market("Brazil", "br", "Portuguese", "pt", ["BR"]),
  market("Mexico", "mx", "Spanish", "es", ["MX"]),
  market("India", "in", "English", "en", ["IN"]),
  market("Japan", "jp", "Japanese", "ja", ["JP"]),
  market("Singapore", "sg", "English", "en", ["SG"]),
  market("New Zealand", "nz", "English", "en", ["NZ"]),
  market("South Africa", "za", "English", "en", ["ZA"]),
  market("United Arab Emirates", "ae", "English", "en", ["AE", "UAE"]),
] as const satisfies readonly SerpMarket[];

export const serpMarkets = markets;
export const serpMarketOptions = serpMarkets.map((item) => item.name);

const marketByName = new Map<SerpMarketName, SerpMarket>(
  serpMarkets.map((item) => [item.name, item]),
);
const marketAliasIndex = new Map<string, SerpMarketName>();

for (const item of serpMarkets) {
  for (const alias of [item.name, ...item.aliases]) {
    marketAliasIndex.set(normalizeAlias(alias), item.name);
  }
}

function market(
  name: SerpMarketName,
  gl: string,
  languageLabel: string,
  languageCode: string,
  aliases: readonly string[] = [],
): SerpMarket {
  return {
    aliases,
    google: { gl },
    language: { code: languageCode, label: languageLabel },
    name,
  };
}

function normalizeAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeSerpMarketName(value: unknown): SerpMarketName | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeAlias(value);
  if (!normalized) {
    return null;
  }

  return marketAliasIndex.get(normalized) ?? null;
}

export function serpMarketLocationValues(value: string) {
  const name = normalizeSerpMarketName(value);
  if (!name) {
    return [value];
  }

  const market = marketByName.get(name);
  if (!market) {
    return [value];
  }

  return Array.from(new Set([market.name, ...market.aliases, value]));
}

export function displaySerpMarketName(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_SERP_MARKET;
  }

  return normalizeSerpMarketName(value) ?? value;
}

export function resolveSerpMarket(value: string): SerpMarket {
  const name = normalizeSerpMarketName(value);
  if (!name) {
    throw new Error(`Unsupported SERP market: ${value}`);
  }

  const market = marketByName.get(name);
  if (!market) {
    throw new Error(`Unsupported SERP market: ${value}`);
  }

  return market;
}

export function resolveSerpDepth(value: number | undefined): SerpDepth {
  if (value === undefined) {
    return DEFAULT_SERP_DEPTH;
  }

  if (serpDepthValues.includes(value as SerpDepth)) {
    return value as SerpDepth;
  }

  throw new Error(`Unsupported SERP depth: ${value}`);
}

export function resolveEffectiveSerpDepth(input: {
  projectDepth?: number | null;
  requestedDepth?: number | null;
  scheduleDepth?: number | null;
}) {
  return resolveSerpDepth(
    input.requestedDepth ?? input.scheduleDepth ?? input.projectDepth ?? undefined,
  );
}

export function resolveSerpStopOnMatch(value: boolean | null | undefined) {
  return value ?? DEFAULT_SERP_STOP_ON_MATCH;
}

export function languageForSerpMarket(value: string | undefined) {
  if (!value) {
    return resolveSerpMarket(DEFAULT_SERP_MARKET).language.label;
  }

  const name = normalizeSerpMarketName(value);
  if (!name) {
    return "English";
  }

  return resolveSerpMarket(name).language.label;
}

export function googleSerpLocale(value: string) {
  const name = normalizeSerpMarketName(value) ?? DEFAULT_SERP_MARKET;
  const market = resolveSerpMarket(name);
  return {
    code: market.google.gl.toUpperCase(),
    gl: market.google.gl,
    hl: market.language.code,
  };
}
