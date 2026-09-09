import { prisma } from "@/lib/db/prisma";
import type { KeywordImportColumnMapping } from "@/lib/keywords/import-csv-parser";
import { untrackedMarketMessage } from "@/lib/markets/archived";
import { KEYWORD_IMPORT_MAX, keywordImportFileLimitMessage } from "@/lib/schemas/keyword";
import { serpCountryByCode } from "@/lib/serp/country-catalog";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import {
  canonicalKeywordImportLocationKey,
  deduplicateKeywordImportRows,
  type KeywordImportRow,
  keywordImportSelectionKey,
  parseKeywordImportCsv,
} from "./keyword-import-csv";
import { keywordImportDefaults } from "./keyword-import-defaults";

type ResolvedImportRow = KeywordImportRow & {
  locationId: string;
  locationLabel: string;
  marketName: string;
  marketStatus: "active" | "paused";
};

/** Review and confirm share exact resolution and the same project registry rules. */
export async function filterReviewRowsByProjectMarkets(
  projectId: string,
  rows: readonly KeywordImportRow[],
) {
  const registeredMarkets = await prisma.projectMarket.findMany({
    select: {
      name: true,
      locationId: true,
      status: true,
      location: { select: { canonicalKey: true } },
    },
    where: { projectId, status: { in: ["active", "paused"] } },
  });
  const registry = new Map(
    registeredMarkets.map((market) => [market.location.canonicalKey, market]),
  );
  const errors: { message: string; row: number }[] = [];
  const resolvedRows: ResolvedImportRow[] = [];
  const locations = new Map<string, Awaited<ReturnType<typeof resolveKeywordLocation>>>();
  const identities = new Set<string>();
  let duplicateRows = 0;
  for (const row of rows) {
    let resolved: Awaited<ReturnType<typeof resolveKeywordLocation>>;
    try {
      const cacheKey = keywordImportSelectionKey(row);
      resolved =
        locations.get(cacheKey) ??
        (await resolveKeywordLocation(
          row.locationKey
            ? { projectId, selection: { canonicalKey: row.locationKey, kind: "city" } }
            : { city: row.city, country: row.location, language: row.language, projectId },
        ));
      locations.set(cacheKey, resolved);
    } catch {
      errors.push({
        message: "Could not resolve this row's market. Check its location and language.",
        row: row.row,
      });
      continue;
    }
    if (
      resolved.degraded ||
      (row.locationKey &&
        resolved.location.canonicalKey !== canonicalKeywordImportLocationKey(row.locationKey))
    ) {
      errors.push({
        message: row.locationKey
          ? `Location key ${row.locationKey} could not be resolved exactly.`
          : `Location ${row.city ?? row.location} could not be resolved exactly. Choose an existing market or use its exact Location key.`,
        row: row.row,
      });
      continue;
    }
    const market = registry.get(resolved.location.canonicalKey);
    if (!market) {
      errors.push({
        message: untrackedMarketMessage(resolved.location.canonicalKey),
        row: row.row,
      });
      continue;
    }
    const identity = `${row.keyword}\0${resolved.location.canonicalKey}\0${row.device}`;
    if (identities.has(identity)) {
      duplicateRows += 1;
      continue;
    }
    identities.add(identity);
    resolvedRows.push({
      ...row,
      city: resolved.location.cityName,
      language: resolved.location.languageCode,
      location:
        serpCountryByCode(resolved.location.countryCode)?.displayName ??
        resolved.location.displayName,
      locationId: resolved.location.id,
      locationLabel: denormalizedLocationLabel(resolved.location),
      locationKey: resolved.location.canonicalKey,
      marketName:
        market.name && market.name !== market.locationId
          ? market.name
          : `${resolved.location.displayName} / ${resolved.location.languageLabel}`,
      marketStatus: market.status === "paused" ? "paused" : "active",
    });
  }
  return { duplicateRows, errors, rows: resolvedRows };
}

export async function reviewKeywordImportRows(
  projectId: string,
  csv: string,
  mapping?: KeywordImportColumnMapping,
  defaultMarketKey?: string | null,
) {
  const { errors, parsed, received } = parseKeywordImportCsv(
    csv,
    await keywordImportDefaults(projectId, defaultMarketKey),
    mapping,
  );
  if (received > KEYWORD_IMPORT_MAX) throw new Error(keywordImportFileLimitMessage(received));
  const { skipped, uniqueRows } = deduplicateKeywordImportRows(parsed);
  const marketReview = await filterReviewRowsByProjectMarkets(projectId, uniqueRows);
  return {
    duplicateRows: skipped + marketReview.duplicateRows,
    errors: [...errors, ...marketReview.errors],
    received,
    rows: marketReview.rows.map(
      ({ locationId: _locationId, locationLabel: _locationLabel, ...row }) => row,
    ),
  };
}
