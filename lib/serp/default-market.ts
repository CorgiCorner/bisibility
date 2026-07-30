import { countryCodeForMarketName, countrySeed } from "./location";
import {
  DEFAULT_SERP_DEVICE,
  DEFAULT_SERP_MARKET,
  normalizeSerpMarketName,
  type SerpDevice,
  serpDeviceValues,
} from "./markets";

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

export function defaultSerpKeywordMarket(
  keywords: readonly Pick<KeywordMarketRow, "device" | "location">[],
) {
  const counts = new Map<string, { count: number; device: SerpDevice; location: string }>();
  for (const keyword of keywords) {
    const location = normalizeSerpMarketName(keyword.location);
    if (!location) {
      continue;
    }
    const key = `${location}\u0000${keyword.device}`;
    const current = counts.get(key);
    counts.set(key, {
      count: (current?.count ?? 0) + 1,
      device: keyword.device,
      location,
    });
  }

  return (
    [...counts.values()].sort(
      (a, b) =>
        b.count - a.count ||
        marketRank(a.location, a.device) - marketRank(b.location, b.device) ||
        a.location.localeCompare(b.location) ||
        serpDeviceValues.indexOf(a.device) - serpDeviceValues.indexOf(b.device),
    )[0] ?? {
      count: 0,
      device: DEFAULT_SERP_DEVICE,
      location: DEFAULT_SERP_MARKET,
    }
  );
}

function marketRank(location: string, device: SerpDevice) {
  if (location === DEFAULT_SERP_MARKET && device === DEFAULT_SERP_DEVICE) {
    return 0;
  }
  if (location === DEFAULT_SERP_MARKET) {
    return 1;
  }
  return 2;
}

function defaultLocationKey() {
  return countryCodeForMarketName(DEFAULT_SERP_MARKET) ?? "US";
}

function countryKey(country: string) {
  return countryCodeForMarketName(country);
}

function fallbackProjectMarket(source: ProjectDefaultMarket["source"]): ProjectDefaultMarket {
  return {
    city: null,
    country: DEFAULT_SERP_MARKET,
    device: DEFAULT_SERP_DEVICE,
    displayName: DEFAULT_SERP_MARKET,
    locationKey: defaultLocationKey(),
    source,
  };
}

function explicitDefaultMarket(
  defaults: ProjectDefaultMarketRow | null | undefined,
): ProjectDefaultMarket | null {
  if (!defaults?.country || !defaults.device) {
    return null;
  }
  const country = normalizeSerpMarketName(defaults.country) ?? defaults.country;
  return {
    city: defaults.city ?? null,
    country,
    device: defaults.device,
    displayName: defaults.city ?? country,
    locationKey: defaults.locationKey ?? countryKey(country) ?? defaultLocationKey(),
    source: "explicit",
  };
}

function locationRefMarket(row: KeywordDefaultMarketRow): ProjectDefaultMarket | null {
  const ref = row.locationRef;
  if (!ref) {
    return null;
  }
  const seed = countrySeed(ref.countryCode);
  const country = seed?.displayName ?? normalizeSerpMarketName(ref.displayName);
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

function legacyLocationMarket(row: KeywordDefaultMarketRow): ProjectDefaultMarket | null {
  const country = normalizeSerpMarketName(row.location);
  if (!country) {
    return null;
  }
  return {
    city: null,
    country,
    device: row.device,
    displayName: country,
    locationKey: countryKey(country) ?? defaultLocationKey(),
    source: "derived",
  };
}

function keywordProjectMarket(row: KeywordDefaultMarketRow): ProjectDefaultMarket | null {
  return locationRefMarket(row) ?? legacyLocationMarket(row);
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
    const market = keywordProjectMarket(row);
    if (!market) {
      continue;
    }
    const key = `${market.locationKey}\u0000${market.device}`;
    counts.set(key, { ...market, count: (counts.get(key)?.count ?? 0) + 1 });
  }

  const selected = [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      marketRank(a.country, a.device) - marketRank(b.country, b.device) ||
      a.displayName.localeCompare(b.displayName) ||
      serpDeviceValues.indexOf(a.device) - serpDeviceValues.indexOf(b.device),
  )[0];
  if (!selected) {
    return fallbackProjectMarket("fallback");
  }
  const { count: _count, ...market } = selected;
  return market;
}

function normalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function nextMarketKey(next: { country: string; locationKey?: string | null }) {
  return next.locationKey ?? countryKey(next.country) ?? defaultLocationKey();
}

function nextMarketDisplay(next: { city?: string | null; country: string; displayName?: string }) {
  return next.displayName ?? next.city ?? next.country;
}

function keywordMarketIdentity(row: KeywordMarketRow) {
  const market = keywordProjectMarket(row);
  if (market) {
    return {
      displayName: market.displayName,
      locationKey: market.locationKey,
    };
  }

  const location = row.location.trim();
  return location ? { displayName: location, locationKey: null } : null;
}

function sameMarket(
  row: KeywordMarketRow,
  market: { displayName: string; locationKey?: string | null },
) {
  const rowMarket = keywordMarketIdentity(row);
  if (!rowMarket) {
    return false;
  }
  if (rowMarket.locationKey && market.locationKey) {
    return rowMarket.locationKey === market.locationKey;
  }
  return normalizedText(rowMarket.displayName) === normalizedText(market.displayName);
}

export function serpMarketUpdatePlan(
  keywords: readonly KeywordMarketRow[],
  next: {
    city?: string | null;
    country: string;
    device: SerpDevice;
    displayName?: string;
    locationKey?: string | null;
  },
  current?: ProjectDefaultMarket,
) {
  const before = current ?? projectDefaultSerpMarket(null, keywords);
  const nextIdentity = {
    displayName: nextMarketDisplay(next),
    locationKey: nextMarketKey(next),
  };
  const candidates = keywords.filter(
    (keyword) => sameMarket(keyword, before) && keyword.device === before.device,
  );
  const candidateIds = new Set(candidates.map((keyword) => keyword.id));
  const conflictingTexts = new Set(
    keywords
      .filter(
        (keyword) =>
          !candidateIds.has(keyword.id) &&
          sameMarket(keyword, nextIdentity) &&
          keyword.device === next.device,
      )
      .map((keyword) => keyword.text),
  );
  const eligible = candidates.filter((keyword) => !conflictingTexts.has(keyword.text));

  return {
    before: { country: before.country, device: before.device },
    skipped: candidates.length - eligible.length,
    updateIds:
      before.locationKey === nextIdentity.locationKey && before.device === next.device
        ? []
        : eligible.map((keyword) => keyword.id),
  };
}
