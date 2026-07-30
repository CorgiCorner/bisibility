import "server-only";

import { prisma } from "@/lib/db/prisma";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { countryCodeForMarketName, type LocationSelection, parseCanonicalKey } from "./location";
import {
  createCityLocationLookup,
  lookupConfigFromConnections,
  suggestLocations,
} from "./location-lookup";
import { type LocationResolution, resolveLocation } from "./location-resolver";
import { prismaLocationStore } from "./location-store";

// Server-side glue for the keyword WRITE path: given a project and a
// {country, city?} selector, build the Prisma store + a lookup from the
// project's configured SERP providers and resolve to a persisted Location.
//
// Country-only selectors are deterministic and skip the provider lookup entirely
// (no network, no creds needed). City selectors go through the project's
// configured provider(s); an unresolved city degrades to the country row with a
// warning. resolveLocation may THROW for an unsupported country - that is the
// intended user-facing/correctable create-edit error (design §5).

export type LegacyKeywordLocationInput = {
  projectId: string;
  /** Legacy market name/alias (e.g. "United States", "usa") - the existing field. */
  country: string;
  /** Optional granular city; when absent we resolve at country level. */
  city?: string | null;
};

export type SelectionKeywordLocationInput = {
  projectId: string;
  selection: LocationSelection;
};

export type ResolveKeywordLocationInput =
  | LegacyKeywordLocationInput
  | SelectionKeywordLocationInput;

export type SuggestKeywordLocationsInput = {
  projectId: string;
  query: string;
  countryCode?: string | null;
  limit?: number;
};

async function loadSerpConnections(projectId: string) {
  const connections = await prisma.providerConnection.findMany({
    orderBy: providerChainOrderBy(),
    select: { credentialsEncrypted: true, provider: true },
    where: { ...providerChainWhere("serp"), projectId },
  });
  return connections;
}

async function lookupForProject(projectId: string) {
  const connections = await loadSerpConnections(projectId);
  const config = lookupConfigFromConnections(connections);
  return {
    config,
    lookup:
      config.dataForSeo || config.serpApi
        ? createCityLocationLookup(config, { projectId })
        : undefined,
  };
}

function isSelectionInput(
  input: ResolveKeywordLocationInput,
): input is SelectionKeywordLocationInput {
  return "selection" in input;
}

async function resolveSelection(input: SelectionKeywordLocationInput): Promise<LocationResolution> {
  if (input.selection.kind === "country") {
    return resolveLocation(
      { countryCode: input.selection.countryCode },
      { store: prismaLocationStore },
    );
  }

  if ("canonicalKey" in input.selection) {
    const cached = await prismaLocationStore.findByKey(input.selection.canonicalKey);
    if (cached) {
      return { degraded: false, location: cached, warning: null };
    }
    const selector = parseCanonicalKey(input.selection.canonicalKey);
    if (!selector) {
      throw new Error(`Unsupported location key: ${input.selection.canonicalKey}`);
    }
    if (!selector.cityName) {
      return resolveLocation(selector, { store: prismaLocationStore });
    }
    const { lookup } = await lookupForProject(input.projectId);
    return resolveLocation(selector, { lookup, store: prismaLocationStore });
  }

  const { lookup } = await lookupForProject(input.projectId);
  return resolveLocation(
    {
      cityName: input.selection.cityName,
      countryCode: input.selection.countryCode,
      regionName: input.selection.regionName,
    },
    { lookup, store: prismaLocationStore },
  );
}

/**
 * @throws Error when the country is not a supported SERP market (create/edit-time,
 *   correctable). The runner/adapter path never calls this - it reads the joined row.
 */
export async function resolveKeywordLocation(
  input: ResolveKeywordLocationInput,
): Promise<LocationResolution> {
  if (isSelectionInput(input)) {
    return resolveSelection(input);
  }

  const countryCode = countryCodeForMarketName(input.country);
  if (!countryCode) {
    throw new Error(`Unsupported country: ${input.country}`);
  }

  const cityName = input.city?.trim() || null;
  // Country-only: deterministic, no provider lookup, no creds required.
  if (!cityName) {
    return resolveLocation({ countryCode }, { store: prismaLocationStore });
  }

  const { lookup } = await lookupForProject(input.projectId);

  return resolveLocation({ cityName, countryCode }, { lookup, store: prismaLocationStore });
}

export async function suggestKeywordLocations(input: SuggestKeywordLocationsInput) {
  const { config } = await lookupForProject(input.projectId);
  if (!config.dataForSeo && !config.serpApi) {
    return [];
  }
  return suggestLocations(
    {
      countryCode: input.countryCode,
      limit: input.limit,
      query: input.query,
    },
    config,
    { projectId: input.projectId },
  );
}
