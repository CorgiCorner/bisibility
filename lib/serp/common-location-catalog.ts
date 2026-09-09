import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import {
  canonicalKey,
  countrySeed,
  type LocationCandidate,
  type LocationLookup,
  type LocationSelector,
  parseCanonicalKey,
} from "./location";

const unzip = promisify(gunzip);
const defaultCatalogPath = path.join(
  process.cwd(),
  "lib/serp/generated/shared-location-catalog.json.gz",
);
let catalogPathForTests: string | null = null;
let catalogPromise: Promise<SharedLocationCatalog> | null = null;

export type SharedLocationCatalogEntry = {
  canonicalKey: string;
  kind: "city" | "region";
  primaryGeoCode: number;
  primaryGeoName: string;
  secondaryGeoName: string;
};

export type SharedLocationSuggestion = LocationCandidate & { canonicalKey: string };

export type SharedLocationSearchInput = {
  countryCode?: string | null;
  limit?: number;
  query: string;
};

type SearchableCatalogEntry = {
  countryCode: string;
  entry: SharedLocationCatalogEntry;
  leaf: string;
  regionCode: string | null;
  regionName: string | null;
  terms: string[];
};

type SharedLocationCatalog = {
  byKey: Map<string, SharedLocationCatalogEntry>;
  searchEntries: SearchableCatalogEntry[];
};

function catalogKey(canonicalKey: string, kind: SharedLocationCatalogEntry["kind"]) {
  return `${kind}:${canonicalKey}`;
}

function unqualifiedKey(value: string) {
  return value.split("@", 1)[0] ?? "";
}

function entryFromTuple(value: unknown): SharedLocationCatalogEntry {
  if (!Array.isArray(value) || value.length !== 5) {
    throw new Error("Shared location catalog contains an invalid tuple.");
  }
  const [canonicalKeyValue, kind, primaryGeoCode, primaryGeoName, secondaryGeoName] = value;
  if (
    typeof canonicalKeyValue !== "string" ||
    (kind !== "city" && kind !== "region") ||
    !Number.isInteger(primaryGeoCode) ||
    primaryGeoCode <= 0 ||
    typeof primaryGeoName !== "string" ||
    !primaryGeoName.trim() ||
    typeof secondaryGeoName !== "string" ||
    !secondaryGeoName.trim() ||
    canonicalKeyValue.includes("@")
  ) {
    throw new Error("Shared location catalog contains an invalid value.");
  }
  const selector = parseCanonicalKey(canonicalKeyValue, kind);
  if (
    !selector ||
    canonicalKey({ ...selector, kind }) !== canonicalKeyValue ||
    !countrySeed(selector.countryCode)
  ) {
    throw new Error("Shared location catalog contains an invalid canonical key.");
  }
  return {
    canonicalKey: canonicalKeyValue,
    kind,
    primaryGeoCode,
    primaryGeoName,
    secondaryGeoName,
  };
}

function parseCatalog(value: unknown): SharedLocationCatalog {
  if (!Array.isArray(value)) throw new Error("Shared location catalog is not an array.");
  const entries = value.map(entryFromTuple);
  const byKey = new Map<string, SharedLocationCatalogEntry>();
  const geoCodes = new Set<number>();
  for (const entry of entries) {
    const key = catalogKey(entry.canonicalKey, entry.kind);
    if (byKey.has(key)) throw new Error(`Shared location catalog repeats ${key}.`);
    if (geoCodes.has(entry.primaryGeoCode)) {
      throw new Error(`Shared location catalog repeats provider code ${entry.primaryGeoCode}.`);
    }
    byKey.set(key, entry);
    geoCodes.add(entry.primaryGeoCode);
  }
  const searchEntries = entries.map((entry) => {
    const selector = parseCanonicalKey(entry.canonicalKey, entry.kind);
    if (!selector)
      throw new Error(`Shared location catalog has invalid key ${entry.canonicalKey}.`);
    const leaf =
      entry.kind === "city" ? selector.cityName : (selector.regionName ?? selector.regionCode);
    return {
      countryCode: selector.countryCode,
      entry,
      leaf: normalized(leaf ?? ""),
      regionCode: selector.regionCode?.toUpperCase() ?? null,
      regionName: selector.regionName ? normalized(selector.regionName) : null,
      terms: entrySearchTerms(entry).map(normalized),
    };
  });
  return { byKey, searchEntries };
}

async function loadCatalog() {
  const compressed = await fs.readFile(catalogPathForTests ?? defaultCatalogPath);
  const text = (await unzip(compressed)).toString("utf8");
  return parseCatalog(JSON.parse(text));
}

async function catalog() {
  catalogPromise ??= loadCatalog();
  return catalogPromise;
}

function toCandidate(entry: SharedLocationCatalogEntry): LocationCandidate {
  const selector = parseCanonicalKey(entry.canonicalKey, entry.kind);
  if (!selector) throw new Error(`Shared location catalog has invalid key ${entry.canonicalKey}.`);
  return {
    cityName: entry.kind === "city" ? (selector.cityName ?? null) : null,
    countryCode: selector.countryCode,
    displayName: entry.primaryGeoName,
    kind: entry.kind,
    primaryGeoCode: entry.primaryGeoCode,
    primaryGeoName: entry.primaryGeoName,
    regionCode: selector.regionCode ?? null,
    regionName: selector.regionName ?? null,
    secondaryGeoName: entry.secondaryGeoName,
  };
}

function toSuggestion(entry: SharedLocationCatalogEntry): SharedLocationSuggestion {
  return { ...toCandidate(entry), canonicalKey: entry.canonicalKey };
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function entrySearchTerms(entry: SharedLocationCatalogEntry) {
  const selector = parseCanonicalKey(entry.canonicalKey, entry.kind);
  if (!selector) return [];
  return [
    entry.kind === "city" ? selector.cityName : (selector.regionName ?? selector.regionCode),
    entry.primaryGeoName,
    entry.secondaryGeoName,
    entry.canonicalKey.replaceAll("/", " "),
  ].filter((value): value is string => Boolean(value));
}

function searchRank(terms: string[], query: string) {
  if (terms.includes(query)) return 0;
  if (terms.some((term) => term.startsWith(query))) return 1;
  return terms.some((term) => term.includes(query)) ? 2 : null;
}

export async function findSharedLocationByCanonicalKey(
  canonicalKeyValue: string,
  kind: SharedLocationCatalogEntry["kind"],
) {
  return (await catalog()).byKey.get(catalogKey(unqualifiedKey(canonicalKeyValue), kind)) ?? null;
}

export async function findSharedLocationCandidateByCanonicalKey(
  canonicalKeyValue: string,
  kind: SharedLocationCatalogEntry["kind"],
) {
  const entry = await findSharedLocationByCanonicalKey(canonicalKeyValue, kind);
  return entry ? toCandidate(entry) : null;
}

export async function searchSharedLocations(input: SharedLocationSearchInput) {
  const query = normalized(input.query);
  if (!query) return [];
  const countryCode = input.countryCode?.trim().toUpperCase() || null;
  const limit = input.limit ?? 10;
  return (await catalog()).searchEntries
    .flatMap(({ countryCode: entryCountryCode, entry, terms }) => {
      const rank = searchRank(terms, query);
      return (!countryCode || entryCountryCode === countryCode) && rank !== null
        ? [{ candidate: toSuggestion(entry), rank }]
        : [];
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.candidate.displayName.localeCompare(right.candidate.displayName) ||
        left.candidate.kind.localeCompare(right.candidate.kind) ||
        left.candidate.canonicalKey.localeCompare(right.candidate.canonicalKey),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

function exactCatalogKey(input: LocationSelector & { kind: "city" | "region" }) {
  if (input.selectedCanonicalKey) return unqualifiedKey(input.selectedCanonicalKey);
  return canonicalKey({ ...input, languageCode: undefined });
}

function matchesUnqualifiedSelector(
  entry: SearchableCatalogEntry,
  input: LocationSelector & { kind: "city" | "region" },
) {
  const leaf = input.kind === "city" ? input.cityName : (input.regionName ?? input.regionCode);
  return (
    entry.entry.kind === input.kind &&
    entry.countryCode === input.countryCode.trim().toUpperCase() &&
    entry.leaf === normalized(leaf ?? "") &&
    (!input.regionName || entry.regionName === normalized(input.regionName)) &&
    (!input.regionCode || entry.regionCode === input.regionCode.trim().toUpperCase())
  );
}

export function createSharedLocationLookup(): LocationLookup {
  return {
    async find(input) {
      if (input.selectedCanonicalKey) {
        const exact = await findSharedLocationByCanonicalKey(exactCatalogKey(input), input.kind);
        return exact ? toCandidate(exact) : null;
      }
      const leaf =
        input.kind === "region" ? (input.regionName ?? input.regionCode) : input.cityName;
      if (!leaf) return null;
      const matches = (await catalog()).searchEntries
        .filter((entry) => matchesUnqualifiedSelector(entry, input))
        .map(({ entry }) => toCandidate(entry));
      return matches.length === 1 ? matches[0] : null;
    },
  };
}

export function setSharedLocationCatalogPathForTests(value: string | null) {
  catalogPathForTests = value;
  catalogPromise = null;
}
