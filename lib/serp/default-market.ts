import { DEFAULT_SERP_DEVICE, type SerpDevice, serpDeviceValues } from "./constants";
import { serpCountryByCode, serpCountryForName } from "./country-catalog";
import { parseCanonicalKey } from "./location";

export type KeywordMarketRow = {
  device: SerpDevice;
  id: string;
  location: string;
  locationRef?: KeywordLocationMarket | null;
  text: string;
};

type KeywordLocationMarket = {
  canonicalKey: string;
  cityName: string | null;
  countryCode: string;
  displayName: string;
  kind: "country" | "region" | "city";
};

export type KeywordDefaultMarketRow = {
  device: SerpDevice;
  location: string;
  locationRef?: KeywordLocationMarket | null;
};

export type ProjectDefaultMarketRow = {
  city?: string | null;
  country?: string | null;
  device?: SerpDevice | null;
  locationKey?: string | null;
};

export type ProjectDefaultMarket = {
  city: string | null;
  country: string;
  device: SerpDevice;
  displayName: string;
  locationKey: string;
  source: "derived" | "explicit" | "fallback";
};

export const keywordMarketSelect = {
  device: true,
  id: true,
  location: true,
  locationRef: {
    select: {
      canonicalKey: true,
      cityName: true,
      countryCode: true,
      displayName: true,
      kind: true,
    },
  },
  text: true,
} as const;

function marketRank(locationKey: string, device: SerpDevice) {
  if (locationKey !== "US") return 2;
  return device === DEFAULT_SERP_DEVICE ? 0 : 1;
}

function fallbackProjectMarket(source: ProjectDefaultMarket["source"]): ProjectDefaultMarket {
  const country = serpCountryByCode("US");
  if (!country) throw new Error("The default country is missing from the country catalog.");
  return {
    city: null,
    country: country.displayName,
    device: DEFAULT_SERP_DEVICE,
    displayName: country.displayName,
    locationKey: "US",
    source,
  };
}

function explicitDefaultMarket(
  defaults: ProjectDefaultMarketRow | null | undefined,
): ProjectDefaultMarket | null {
  if (!defaults?.device) return null;
  // Older persisted project defaults may predate locationKey. Translate only that
  // compatibility input; a canonical key always wins over the stored display label.
  const locationKey =
    defaults.locationKey ??
    (defaults.country ? serpCountryForName(defaults.country)?.countryCode : null);
  if (!locationKey) return null;
  const parsed = parseCanonicalKey(locationKey);
  if (!parsed) return null;
  const country = serpCountryByCode(parsed.countryCode);
  if (!country) return null;
  return {
    city: defaults.city ?? null,
    country: country.displayName,
    device: defaults.device,
    displayName: defaults.city ?? parsed.cityName ?? parsed.regionName ?? country.displayName,
    locationKey,
    source: "explicit",
  };
}

function locationRefMarket(row: KeywordDefaultMarketRow): ProjectDefaultMarket | null {
  const ref = row.locationRef;
  if (!ref) {
    return null;
  }
  const country = serpCountryByCode(ref.countryCode)?.displayName;
  if (!country) {
    return null;
  }
  const isCity = ref.kind === "city";
  return {
    city: isCity ? ref.displayName : null,
    country,
    device: row.device,
    displayName: ref.displayName,
    locationKey: ref.canonicalKey,
    source: "derived",
  };
}

export function projectDefaultSerpMarket(
  defaults: ProjectDefaultMarketRow | null | undefined,
  keywords: readonly KeywordDefaultMarketRow[],
): ProjectDefaultMarket {
  const explicit = explicitDefaultMarket(defaults);
  if (explicit) {
    return explicit;
  }

  const counts = new Map<string, ProjectDefaultMarket & { count: number }>();
  for (const row of keywords) {
    const market = locationRefMarket(row);
    if (!market) {
      continue;
    }
    const key = `${market.locationKey}\u0000${market.device}`;
    counts.set(key, { ...market, count: (counts.get(key)?.count ?? 0) + 1 });
  }

  const selected = [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      marketRank(a.locationKey, a.device) - marketRank(b.locationKey, b.device) ||
      a.displayName.localeCompare(b.displayName) ||
      serpDeviceValues.indexOf(a.device) - serpDeviceValues.indexOf(b.device),
  )[0];
  if (!selected) {
    return fallbackProjectMarket("fallback");
  }
  const { count: _count, ...market } = selected;
  return market;
}
