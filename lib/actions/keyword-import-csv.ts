import {
  CsvParseError,
  parseKeywordImportCsvTable,
  splitKeywordImportTags,
} from "@/lib/keywords/import-csv-parser";
import { addKeywordSchema } from "@/lib/schemas/keyword";
import type { ProjectDefaultMarket } from "@/lib/serp/default-market";
import {
  DEFAULT_SERP_DEVICE,
  DEFAULT_SERP_MARKET,
  normalizeSerpMarketName,
  resolveSerpMarket,
} from "@/lib/serp/markets";

export type KeywordImportRow = {
  city?: string | null;
  device: "desktop" | "mobile";
  intent?: string | null;
  keyword: string;
  language?: string | null;
  location: string;
  locationKey?: string | null;
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
  country: DEFAULT_SERP_MARKET,
  device: DEFAULT_SERP_DEVICE,
  locationKey: "US",
};

function importLocationKey(location: string) {
  const market = normalizeSerpMarketName(location);
  if (market) return resolveSerpMarket(market).google.gl.toUpperCase();
  return location.trim().replace(/\s+/g, " ");
}

function qualifyImportLocationKey(locationKey: string, language: string) {
  return `${locationKey.split("@", 1)[0]}@${language}`;
}

export function parseKeywordImportCsv(
  csv: string,
  defaults: Pick<
    ProjectDefaultMarket,
    "city" | "country" | "device" | "locationKey"
  > = fallbackImportDefaults,
) {
  let table: ReturnType<typeof parseKeywordImportCsvTable>;
  try {
    table = parseKeywordImportCsvTable(csv);
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
    const rowLocationKey = row[table.columns.locationKey]?.trim() || undefined;
    const rowTopic = row[table.columns.topic]?.trim() || undefined;
    const hasGeographyOverride = Boolean(rowCity || rowLocation || rowLocationKey);
    const locationKeyBase =
      rowLocationKey ??
      (rowCity || rowLocation
        ? [importLocationKey(rowLocation || defaults.country), rowCity].filter(Boolean).join("/")
        : defaults.locationKey);
    const qualifiedLocationKey =
      rowLanguage && locationKeyBase && !rowLocationKey?.includes("@")
        ? qualifyImportLocationKey(locationKeyBase, rowLanguage)
        : rowLocationKey;
    const result = addKeywordSchema.safeParse({
      city: rowCity ?? (hasGeographyOverride ? null : defaults.city),
      device: row[table.columns.device] || defaults.device,
      intent: rowIntent,
      keyword: row[table.columns.keyword] ?? "",
      location: rowLocation || defaults.country,
      locationKey:
        qualifiedLocationKey ?? (rowCity || rowLocation ? undefined : defaults.locationKey),
      projectId: "project",
      tags: splitKeywordImportTags(row[table.columns.tags] ?? ""),
      targetUrl: row[table.columns.targetUrl] || undefined,
      topic: rowTopic,
    });
    if (result.success) parsed.push({ ...result.data, language: rowLanguage, row: rowNumber });
    else {
      errors.push({
        message: result.error.issues[0]?.message ?? "Invalid row.",
        row: rowNumber,
      });
    }
  }
  return { errors, parsed, received: table.dataRows.length };
}

export function keywordImportKey(
  row: Pick<KeywordImportRow, "city" | "device" | "keyword" | "location" | "locationKey">,
) {
  const city = row.city?.trim().replace(/\s+/g, " ");
  const locationKey =
    row.locationKey?.trim() ||
    [importLocationKey(row.location), city].filter(Boolean).join("\u0000");
  return `${row.keyword}\u0000${locationKey}\u0000${row.device}`;
}
