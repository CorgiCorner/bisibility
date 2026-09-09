import { legacyMarketLocationKey } from "@/lib/api/legacy-market-input";
import {
  CsvParseError,
  type KeywordImportColumnMapping,
  parseKeywordImportCsvTable,
  splitKeywordImportTags,
} from "@/lib/keywords/import-csv-parser";
import { addKeywordSchema } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEVICE } from "@/lib/serp/constants";
import { serpCountryByCode } from "@/lib/serp/country-catalog";
import type { ProjectDefaultMarket } from "@/lib/serp/default-market";
import { resolveSerpLanguage } from "@/lib/serp/language-catalog";
import { normalizeCanonicalLocationKey } from "@/lib/serp/location";

const fallbackImportCountry = serpCountryByCode("US");
if (!fallbackImportCountry)
  throw new Error("The default country is missing from the country catalog.");

export type KeywordImportRow = {
  city?: string | null;
  device: "desktop" | "mobile";
  intent?: string | null;
  keyword: string;
  language?: string | null;
  location: string;
  locationKey?: string | null;
  locationKeyIsExplicit?: boolean;
  row: number;
  tags: string[];
  targetUrl?: string | null;
  topic?: string | null;
};

const fallbackImportDefaults: Pick<
  ProjectDefaultMarket,
  "city" | "country" | "device" | "locationKey"
> = {
  city: null,
  country: fallbackImportCountry.displayName,
  device: DEFAULT_SERP_DEVICE,
  locationKey: fallbackImportCountry.countryCode,
};

function importLocationKey(location: string) {
  const value = location.trim().replace(/\s+/g, " ");
  try {
    return normalizeCanonicalLocationKey(value).canonicalKey;
  } catch {
    try {
      return legacyMarketLocationKey({ country: value });
    } catch {
      return value;
    }
  }
}

function qualifyImportLocationKey(locationKey: string, language: string) {
  const languageCode = resolveSerpLanguage(language)?.code ?? language;
  return `${normalizedLocationKey(locationKey).split("@", 1)[0]}@${languageCode}`;
}

function normalizedLocationKey(value: string) {
  const key = value.trim();
  try {
    const { canonicalKey } = normalizeCanonicalLocationKey(key);
    const rawLanguage = key.includes("@") ? key.slice(key.indexOf("@") + 1) : null;
    const languageCode = rawLanguage
      ? (resolveSerpLanguage(rawLanguage)?.code ?? rawLanguage)
      : null;
    return languageCode ? `${canonicalKey.split("@", 1)[0]}@${languageCode}` : canonicalKey;
  } catch {
    return key;
  }
}

export function canonicalKeywordImportLocationKey(locationKey: string) {
  return normalizeCanonicalLocationKey(locationKey).canonicalKey;
}

export function parseKeywordImportCsv(
  csv: string,
  defaults: Pick<
    ProjectDefaultMarket,
    "city" | "country" | "device" | "locationKey"
  > = fallbackImportDefaults,
  mapping?: KeywordImportColumnMapping,
) {
  let table: ReturnType<typeof parseKeywordImportCsvTable>;
  try {
    table = parseKeywordImportCsvTable(
      csv,
      mapping && Object.keys(mapping).length ? { hasHeader: true, mapping } : undefined,
    );
  } catch (error) {
    if (error instanceof CsvParseError)
      return { errors: [{ message: error.message, row: error.row }], parsed: [], received: 0 };
    throw error;
  }
  const errors: { message: string; row: number }[] = [];
  const parsed: KeywordImportRow[] = [];

  for (const [offset, row] of table.dataRows.entries()) {
    const rowNumber = offset + table.firstDataRowNumber;
    const rowCity = row[table.columns.city]?.trim() || undefined;
    const rowIntent = row[table.columns.intent]?.trim() || undefined;
    const rowLocation = row[table.columns.location]?.trim() || undefined;
    const rowLanguage = row[table.columns.language]?.trim() || undefined;
    const inheritedLanguage =
      !rowLocation && defaults.locationKey
        ? normalizeCanonicalLocationKey(defaults.locationKey).selector.languageCode
        : undefined;
    const rowLocationKey = row[table.columns.locationKey]?.trim() || undefined;
    const directLocationKey = rowLocationKey ? normalizedLocationKey(rowLocationKey) : undefined;
    const rowTopic = row[table.columns.topic]?.trim() || undefined;
    const hasGeographyOverride = Boolean(rowCity || rowLocation || rowLocationKey);
    const locationKeyBase =
      directLocationKey ??
      (rowCity ? undefined : rowLocation ? importLocationKey(rowLocation) : defaults.locationKey);
    const qualifiedLocationKey =
      rowLanguage && locationKeyBase && !directLocationKey?.includes("@")
        ? qualifyImportLocationKey(locationKeyBase, rowLanguage)
        : directLocationKey;
    const canonicalLocationKey = qualifiedLocationKey ?? locationKeyBase;
    const result = addKeywordSchema.safeParse({
      city: rowCity ?? (hasGeographyOverride ? null : defaults.city),
      device: row[table.columns.device] || defaults.device,
      intent: rowIntent,
      keyword: row[table.columns.keyword] ?? "",
      location: rowLocation || defaults.country || fallbackImportDefaults.country,
      locationKey: canonicalLocationKey || undefined,
      projectId: "project",
      tags: splitKeywordImportTags(row[table.columns.tags] ?? ""),
      targetUrl: row[table.columns.targetUrl] || undefined,
      topic: rowTopic,
    });
    if (result.success) {
      if (!rowLocation && !rowLocationKey && !defaults.locationKey) {
        errors.push({
          message:
            "Choose a market for rows without a location, or provide Country and Language or an exact Location key in this row.",
          row: rowNumber,
        });
        continue;
      }
      parsed.push({
        ...result.data,
        ...(directLocationKey ? { locationKeyIsExplicit: true } : {}),
        language: rowLanguage ?? (!rowLocationKey ? inheritedLanguage : undefined),
        row: rowNumber,
      });
    } else {
      errors.push({
        message: result.error.issues[0]?.message ?? "Invalid row.",
        row: rowNumber,
      });
    }
  }
  return { errors, parsed, received: table.dataRows.length };
}

export function keywordImportLocationKey(
  row: Pick<KeywordImportRow, "city" | "language" | "location" | "locationKey">,
) {
  const city = row.city?.trim().replace(/\s+/g, " ");
  const locationKey =
    row.locationKey?.trim() || [importLocationKey(row.location), city].filter(Boolean).join("/");
  return row.locationKey || !row.language
    ? locationKey
    : qualifyImportLocationKey(locationKey, row.language);
}

export function keywordImportSelectionKey(
  row: Pick<KeywordImportRow, "city" | "language" | "location" | "locationKey">,
) {
  const source = row.locationKey ? "canonical" : "legacy";
  return `${source}\u0000${keywordImportLocationKey(row)}`;
}

export function keywordImportKey(
  row: Pick<
    KeywordImportRow,
    "city" | "device" | "keyword" | "language" | "location" | "locationKey"
  >,
) {
  const selectionKey = keywordImportSelectionKey(row);
  return `${row.keyword}\u0000${selectionKey}\u0000${row.device}`;
}

export function deduplicateKeywordImportRows(rows: readonly KeywordImportRow[]) {
  const seen = new Set<string>();
  const uniqueRows: KeywordImportRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const key = keywordImportKey(row);
    if (seen.has(key)) skipped += 1;
    else {
      seen.add(key);
      uniqueRows.push(row);
    }
  }
  return { skipped, uniqueRows };
}
