import "server-only";

import {
  createSharedLocationLookup,
  findSharedLocationCandidateByCanonicalKey,
  searchSharedLocations,
} from "./common-location-catalog";
import {
  countryCodeForMarketName,
  type LocationDescription,
  type LocationSelection,
  type LocationStore,
  normalizeCanonicalLocationKey,
} from "./location";
import { type LocationResolution, resolveLocation } from "./location-resolver";
import { prismaLocationStore } from "./location-store";

// Server-side glue for the keyword WRITE path: given a project and a
// {country, region?, city?} selector, resolve against the shared offline
// location catalog, and persist the selected provider handles.
//
// Country-only selectors are deterministic and skip catalog loading. An
// unresolved granular location degrades to
// the country row with a warning. resolveLocation may THROW for an unsupported
// country - that is the intended user-facing/correctable create-edit error.

export type LegacyKeywordLocationInput = {
  projectId: string;
  /** Legacy market name/alias (e.g. "United States", "usa") - the existing field. */
  country: string;
  /** Optional granular city; when absent we resolve at country level. */
  city?: string | null;
  /** Optional SERP UI language; default language for the country may be omitted. */
  language?: string | null;
};

export type SelectionKeywordLocationInput = {
  projectId: string;
  selection: LocationSelection;
};

export type ResolveKeywordLocationInput =
  | LegacyKeywordLocationInput
  | SelectionKeywordLocationInput;

export type SuggestKeywordLocationsInput = {
  projectId?: string | null;
  query: string;
  countryCode?: string | null;
  limit?: number;
};

const sharedLocationLookup = createSharedLocationLookup();

function resolveWithCatalog<T extends LocationDescription>(
  selector: Parameters<typeof resolveLocation>[0],
  store: LocationStore<T>,
  trustedCandidate?: Awaited<ReturnType<typeof findSharedLocationCandidateByCanonicalKey>>,
) {
  return resolveLocation(selector, {
    lookup: sharedLocationLookup,
    store,
    ...(trustedCandidate ? { trustedCandidate } : {}),
  });
}

function isSelectionInput(
  input: ResolveKeywordLocationInput,
): input is SelectionKeywordLocationInput {
  return "selection" in input;
}

async function resolveSelection<T extends LocationDescription>(
  input: SelectionKeywordLocationInput,
  store: LocationStore<T>,
): Promise<LocationResolution<T>> {
  if (input.selection.kind === "country") {
    if ("canonicalKey" in input.selection) {
      const normalized = normalizeCanonicalLocationKey(input.selection.canonicalKey, "country");
      return resolveLocation(normalized.selector, { store });
    }
    return resolveLocation(
      {
        countryCode: input.selection.countryCode,
        languageCode: input.selection.languageCode,
      },
      { store },
    );
  }

  if ("canonicalKey" in input.selection) {
    const normalized = normalizeCanonicalLocationKey(
      input.selection.canonicalKey,
      input.selection.kind,
    );
    const trustedCandidate = await findSharedLocationCandidateByCanonicalKey(
      normalized.canonicalKey,
      input.selection.kind,
    );
    const cached = await store.findByKey(normalized.canonicalKey);
    if (cached && !trustedCandidate) {
      return { degraded: false, location: cached, warning: null };
    }
    const selector = { ...normalized.selector, selectedCanonicalKey: normalized.canonicalKey };
    if (!selector.cityName && !selector.regionName && !selector.regionCode) {
      return resolveLocation(selector, { store });
    }
    const resolution = await resolveWithCatalog(selector, store, trustedCandidate);
    const canRetryAsRegion =
      input.selection.kind === "city" &&
      Boolean(normalized.selector.cityName) &&
      !normalized.selector.regionName &&
      !normalized.selector.regionCode;
    if (!resolution.degraded || !canRetryAsRegion) {
      return resolution;
    }
    // Older generic location-key callers sent `kind: city` for every granular
    // key. A two-part key can be a region, so retry it as that exact catalog item.
    return resolveLocation(
      {
        countryCode: normalized.selector.countryCode,
        kind: "region",
        languageCode: normalized.selector.languageCode,
        regionName: normalized.selector.cityName,
        selectedCanonicalKey: normalized.canonicalKey,
      },
      { lookup: sharedLocationLookup, store },
    );
  }

  return resolveWithCatalog(
    {
      countryCode: input.selection.countryCode,
      kind: input.selection.kind,
      languageCode: input.selection.languageCode,
      regionCode: input.selection.kind === "region" ? input.selection.regionCode : undefined,
      regionName: input.selection.regionName,
      cityName: input.selection.kind === "city" ? input.selection.cityName : null,
    },
    store,
  );
}

/**
 * @throws Error when the country is not a supported SERP market (create/edit-time,
 *   correctable). The runner/adapter path never calls this - it reads the joined row.
 */
export function resolveKeywordLocation(
  input: ResolveKeywordLocationInput,
): Promise<LocationResolution> {
  return resolveKeywordLocationUsingStore(input, prismaLocationStore);
}

/** Same offline resolver; callers choose whether a resolved description is persisted. */
export async function resolveKeywordLocationUsingStore<T extends LocationDescription>(
  input: ResolveKeywordLocationInput,
  store: LocationStore<T>,
): Promise<LocationResolution<T>> {
  if (isSelectionInput(input)) {
    return resolveSelection(input, store);
  }

  const countryCode = countryCodeForMarketName(input.country);
  if (!countryCode) {
    throw new Error(`Unsupported country: ${input.country}`);
  }

  const cityName = input.city?.trim() || null;
  const languageCode = input.language?.trim() || undefined;
  // Country-only: deterministic, no provider lookup, no creds required.
  if (!cityName) {
    return resolveLocation({ countryCode, languageCode }, { store });
  }

  return resolveWithCatalog({ cityName, countryCode, languageCode }, store);
}

export async function suggestKeywordLocations({
  countryCode,
  limit,
  query,
}: SuggestKeywordLocationsInput) {
  return searchSharedLocations({ countryCode, limit, query });
}
