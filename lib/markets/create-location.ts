import "server-only";

import { locationLanguage, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import type { NewMarketCreateInput } from "./create-input";

export class MarketLocationError extends Error {
  readonly code = "market_location_invalid";

  constructor() {
    super("Choose a valid market location.");
    this.name = "MarketLocationError";
  }
}

/**
 * Turns the form's canonical key into a persisted Location row through the same resolver the
 * onboarding reconcile uses: a country selector is deterministic and offline, a city or region key
 * is served from the Location cache or, on a miss, from the project's provider and cached. This
 * runs before the market transaction opens: the resolver's cache write is an idempotent upsert on
 * the global Location table and a provider lookup is a network call, which must not sit inside a
 * serializable transaction with a five second budget. The name from the form is never trusted;
 * what the key resolves to must match the country, language and kind the form claimed, and a city
 * that degraded to its country is refused rather than silently tracked at country level.
 */
export async function resolveMarketLocation(projectId: string, data: NewMarketCreateInput) {
  let expected: ReturnType<typeof normalizeCanonicalLocationKey>;
  let expectedLanguage: string;
  let resolution: Awaited<ReturnType<typeof resolveKeywordLocation>>;
  try {
    expected = normalizeCanonicalLocationKey(data.canonicalKey, data.kind);
    expectedLanguage = locationLanguage(expected.selector.countryCode, data.languageCode).code;
    const selection =
      data.kind === "country"
        ? { canonicalKey: data.canonicalKey, kind: "country" as const }
        : data.kind === "region"
          ? { canonicalKey: data.canonicalKey, kind: "region" as const }
          : { canonicalKey: data.canonicalKey, kind: "city" as const };
    resolution = await resolveKeywordLocation({
      projectId,
      selection,
    });
  } catch {
    throw new MarketLocationError();
  }
  const { location } = resolution;
  if (
    resolution.degraded ||
    expected.selector.countryCode !== data.countryCode.trim().toUpperCase() ||
    location.canonicalKey !== expected.canonicalKey ||
    location.countryCode !== data.countryCode.trim().toUpperCase() ||
    location.languageCode !== expectedLanguage ||
    location.kind !== data.kind
  ) {
    throw new MarketLocationError();
  }
  return location;
}
