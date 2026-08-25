import { prisma } from "@/lib/db/prisma";
import type { KeywordImportColumnMapping } from "@/lib/keywords/import-csv-parser";
import { KEYWORD_IMPORT_MAX, keywordImportFileLimitMessage } from "@/lib/schemas/keyword";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import {
  deduplicateKeywordImportRows,
  type KeywordImportRow,
  parseKeywordImportCsv,
} from "./keyword-import-csv";
import { keywordImportDefaults } from "./keyword-import-defaults";

export async function filterReviewRowsByProjectMarkets(
  projectId: string,
  rows: readonly KeywordImportRow[],
) {
  const registeredMarkets = await prisma.projectMarket.findMany({
    select: { location: { select: { canonicalKey: true } } },
    where: { projectId, status: { in: ["active", "paused"] } },
  });
  const registeredKeys = new Set(registeredMarkets.map((market) => market.location.canonicalKey));
  const errors: { message: string; row: number }[] = [];
  const resolvedRows: KeywordImportRow[] = [];
  const locations = new Map<string, Awaited<ReturnType<typeof resolveKeywordLocation>>>();

  for (const row of rows) {
    const cacheKey = row.locationKey ?? `${row.location}\u0000${row.city ?? ""}`;
    let resolved = locations.get(cacheKey);
    if (!resolved) {
      resolved = await resolveKeywordLocation(
        row.locationKey
          ? { projectId, selection: { canonicalKey: row.locationKey, kind: "city" } }
          : { city: row.city, country: row.location, projectId },
      );
      locations.set(cacheKey, resolved);
    }
    if (!registeredKeys.has(resolved.location.canonicalKey)) {
      errors.push({
        message: `Market ${resolved.location.canonicalKey} is not tracked by this project. Add it in Settings > Markets first.`,
        row: row.row,
      });
      continue;
    }
    resolvedRows.push(row);
  }
  return { errors, rows: resolvedRows };
}

export async function reviewKeywordImportRows(
  projectId: string,
  csv: string,
  mapping?: KeywordImportColumnMapping,
) {
  const { errors, parsed, received } = parseKeywordImportCsv(
    csv,
    await keywordImportDefaults(projectId),
    mapping,
  );
  if (received > KEYWORD_IMPORT_MAX) throw new Error(keywordImportFileLimitMessage(received));
  const { skipped, uniqueRows } = deduplicateKeywordImportRows(parsed);
  const marketReview = await filterReviewRowsByProjectMarkets(projectId, uniqueRows);
  return {
    duplicateRows: skipped,
    errors: [...errors, ...marketReview.errors],
    received,
    rows: marketReview.rows,
  };
}
