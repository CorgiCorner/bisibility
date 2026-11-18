import "server-only";

import type { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { resolveSerpLanguage } from "@/lib/serp/language-catalog";
import {
  canonicalKey,
  LocationInputError,
  type LocationSelection,
  normalizeCanonicalLocationKey,
} from "@/lib/serp/location";
import { legacyMarketLocationKey, legacyMarketLocationSelection } from "./legacy-market-input";

// Every create item ends as a location key; legacy names pass through the translator.
export type CreateMarket = {
  device: "desktop" | "mobile";
  locationKey: string;
  selection: LocationSelection;
  source: "canonical" | "legacy";
};
export type KeywordCreateTransaction = Pick<
  Prisma.TransactionClient,
  | "$executeRaw"
  | "$queryRaw"
  | "auditLog"
  | "checkSchedule"
  | "project"
  | "rankCheckRun"
  | "rankCheckRunItem"
  | "rankCheck"
  | "queuedRankCheckTask"
  | "keyword"
  | "keywordTag"
  | "location"
  | "keywordSchedule"
  | "projectMarket"
  | "projectDefaults"
  | "providerConnection"
  | "tag"
>;
export type KeywordCreateClient =
  | KeywordCreateTransaction
  | (KeywordCreateTransaction & Pick<typeof prisma, "$transaction">);

export async function loadCreateDefaultMarket(projectId: string, client: KeywordCreateClient) {
  const [defaults, keywords] = await Promise.all([
    client.projectDefaults.findUnique({ where: { projectId } }),
    client.keyword.findMany({
      select: { device: true, location: true, locationRef: true },
      where: { projectId },
    }),
  ]);
  return projectDefaultSerpMarket(defaults, keywords);
}

function defaultLocationKeyWithLanguage(locationKey: string, language: string | null | undefined) {
  if (!language) return locationKey;
  const languageCode = resolveSerpLanguage(language)?.code;
  if (!languageCode) {
    throw new LocationInputError("languageCode", `Unsupported language: ${language}`);
  }
  const { selector } = normalizeCanonicalLocationKey(locationKey);
  return canonicalKey({ ...selector, languageCode });
}

export function createMarket(
  item: {
    city?: string | null;
    country?: string;
    device?: "desktop" | "mobile";
    language?: string | null;
    location?: string;
    location_key?: string;
  },
  defaults: Awaited<ReturnType<typeof loadCreateDefaultMarket>>,
): CreateMarket {
  const device = item.device ?? defaults.device;
  if (item.location_key) {
    return {
      device,
      locationKey: item.location_key,
      selection: { canonicalKey: item.location_key, kind: "city" },
      source: "canonical",
    };
  }
  const country = item.location ?? item.country;
  if (country) {
    const legacyInput = {
      city: item.city,
      country,
      language: item.language,
    };
    return {
      device,
      locationKey: legacyMarketLocationKey(legacyInput),
      selection: legacyMarketLocationSelection(legacyInput),
      source: "legacy",
    };
  }
  if (item.city) {
    const legacyInput = {
      city: item.city,
      country: defaults.country,
      language: item.language,
    };
    return {
      device,
      locationKey: legacyMarketLocationKey(legacyInput),
      selection: legacyMarketLocationSelection(legacyInput),
      source: "legacy",
    };
  }
  if (defaults.locationKey) {
    const locationKey = defaultLocationKeyWithLanguage(defaults.locationKey, item.language);
    return {
      device,
      locationKey,
      selection: { canonicalKey: locationKey, kind: "city" },
      source: "canonical",
    };
  }
  const legacyInput = {
    city: defaults.city,
    country: defaults.country,
    language: item.language,
  };
  return {
    device,
    locationKey: legacyMarketLocationKey(legacyInput),
    selection: legacyMarketLocationSelection(legacyInput),
    source: "legacy",
  };
}

export function locationInput(market: CreateMarket, projectId: string) {
  return { projectId, selection: market.selection };
}

export function marketKey(market: CreateMarket) {
  return `${market.source}\u0000${market.locationKey}`;
}
