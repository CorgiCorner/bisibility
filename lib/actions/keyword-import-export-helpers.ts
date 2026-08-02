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
import ExcelJS from "exceljs";

export const keywordExportColumns = [
  "url",
  "tags",
  "topic",
  "intent",
  "country",
  "device",
  "change",
] as const;

export type KeywordExportColumn = (typeof keywordExportColumns)[number];
export type KeywordExportOptions = {
  columns: Record<KeywordExportColumn, boolean>;
  granularity: "daily" | "weekly";
  range: "30" | "90" | "all";
  scope: "current" | "history";
};
export type KeywordImportRow = {
  city?: string | null;
  device: "desktop" | "mobile";
  keyword: string;
  location: string;
  locationKey?: string | null;
  row: number;
  tags: string[];
  targetUrl?: string | null;
  topic?: string | null;
  intent?: string | null;
};
export type KeywordExportRow = {
  createdAt: Date;
  device: "desktop" | "mobile";
  publicId: string;
  rankChecks: {
    checkedAt: Date;
    normalizationVersion: string | null;
    position: number | null;
    previousPosition: number | null;
    provider: string;
    rankingUrl: string | null;
    requestedDepth: number | null;
  }[];
  tags: { tag: { name: string } }[];
  targetUrl: string | null;
  text: string;
  location: string;
  topic: string | null;
  intent: string | null;
};

type KeywordExportOptionInput = Omit<KeywordExportOptions, "columns"> & {
  columns: Partial<Record<KeywordExportColumn, boolean>>;
};

export function keywordExportOptions(data: KeywordExportOptionInput): KeywordExportOptions {
  // biome-ignore format: compact object keeps the server action under the file line cap.
  return {
    columns: Object.fromEntries(keywordExportColumns.map((column) => [column, data.columns[column] ?? false])) as KeywordExportOptions["columns"], granularity: data.granularity, range: data.range, scope: data.scope,
  };
}

const fallbackImportDefaults: Pick<
  ProjectDefaultMarket,
  "city" | "country" | "device" | "locationKey"
> = {
  city: null,
  country: DEFAULT_SERP_MARKET,
  device: DEFAULT_SERP_DEVICE,
  locationKey: "US",
};

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
    const rowLocationKey = row[table.columns.locationKey]?.trim() || undefined;
    const rowTopic = row[table.columns.topic]?.trim() || undefined;
    const hasRowLocation = Boolean(rowCity || rowLocation || rowLocationKey);
    const hasOwnLocation = Boolean(rowCity || rowLocation);
    const result = addKeywordSchema.safeParse({
      city: rowCity ?? (hasRowLocation ? null : defaults.city),
      device: row[table.columns.device] || defaults.device,
      intent: rowIntent,
      keyword: row[table.columns.keyword] ?? "",
      location: rowLocation || defaults.country,
      locationKey: rowLocationKey ?? (hasOwnLocation ? undefined : defaults.locationKey),
      projectId: "project",
      tags: splitKeywordImportTags(row[table.columns.tags] ?? ""),
      targetUrl: row[table.columns.targetUrl] || undefined,
      topic: rowTopic,
    });
    if (result.success) parsed.push({ ...result.data, row: rowNumber });
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

function importLocationKey(location: string) {
  const market = normalizeSerpMarketName(location);
  if (market) {
    return resolveSerpMarket(market).google.gl.toUpperCase();
  }
  return location.trim().replace(/\s+/g, " ");
}

function cutoff(range: KeywordExportOptions["range"]) {
  if (range === "all") return null;
  const value = new Date();
  value.setDate(value.getDate() - Number(range));
  return value;
}

function weekKey(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000,
  );
  return `${date.getUTCFullYear()}-${Math.floor(day / 7)}`;
}

export function selectedChecks(row: KeywordExportRow, options: KeywordExportOptions) {
  const minDate = cutoff(options.range);
  const checks = row.rankChecks.filter((check) => !minDate || check.checkedAt >= minDate);
  if (options.granularity === "daily") return checks;
  const weeks = new Set<string>();
  return checks.filter((check) => {
    const key = weekKey(check.checkedAt);
    if (weeks.has(key)) return false;
    weeks.add(key);
    return true;
  });
}

function exportCellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "function") return value.name;
  if (typeof value === "symbol") return value.description ?? "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return value.toString(10);
  // All other JavaScript value categories are handled above, leaving bigint.
  return (value as bigint).toString(10);
}

function csvCell(value: unknown) {
  const text = exportCellText(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCsv(headers: string[], rows: Record<string, unknown>[]) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
}

function currentRows(keywords: KeywordExportRow[], options: KeywordExportOptions) {
  const headers = ["keyword", "position"];
  if (options.columns.url) headers.push("target_url");
  if (options.columns.tags) headers.push("tags");
  if (options.columns.topic) headers.push("topic");
  if (options.columns.intent) headers.push("intent");
  if (options.columns.country) headers.push("country");
  if (options.columns.device) headers.push("device");
  if (options.columns.change) headers.push("change");
  return {
    headers,
    rows: keywords.map((row) => {
      const latest = row.rankChecks[0];
      return {
        change:
          latest?.previousPosition && latest.position
            ? latest.previousPosition - latest.position
            : "",
        country: row.location,
        device: row.device,
        keyword: row.text,
        position: latest?.position ?? "",
        tags: row.tags.map((item) => item.tag.name).join(";"),
        target_url: row.targetUrl ?? "",
        topic: row.topic ?? "",
        intent: row.intent ?? "",
      };
    }),
  };
}

function historyRows(keywords: KeywordExportRow[], options: KeywordExportOptions) {
  const headers = [
    "keyword",
    "checked_at",
    "position",
    "ranking_url",
    "provider",
    "requested_depth",
    "normalization_version",
  ];
  return {
    headers,
    rows: keywords.flatMap((row) =>
      selectedChecks(row, options).map((check) => ({
        checked_at: check.checkedAt,
        keyword: row.text,
        normalization_version: check.normalizationVersion ?? "",
        position: check.position ?? "",
        provider: check.provider,
        ranking_url: check.rankingUrl ?? "",
        requested_depth: check.requestedDepth ?? "",
      })),
    ),
  };
}

export function keywordExportTable(keywords: KeywordExportRow[], options: KeywordExportOptions) {
  return options.scope === "history"
    ? historyRows(keywords, options)
    : currentRows(keywords, options);
}

export function serializeKeywordExportCsv(
  keywords: KeywordExportRow[],
  options: KeywordExportOptions,
) {
  const table = keywordExportTable(keywords, options);
  return serializeCsv(table.headers, table.rows);
}

export async function serializeKeywordExportXlsx(
  keywords: KeywordExportRow[],
  options: KeywordExportOptions,
) {
  const table = keywordExportTable(keywords, options);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "bisibility";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(options.scope === "history" ? "Ranking history" : "Keywords");
  sheet.addRow(table.headers);
  for (const row of table.rows) {
    const values = table.headers.map((header) => {
      const value = (row as Record<string, unknown>)[header];
      return value instanceof Date ? exportCellText(value) : value;
    });
    sheet.addRow(values);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const column of sheet.columns) {
    column.width = Math.min(
      60,
      Math.max(12, ...(column.values ?? []).map((value) => exportCellText(value).length + 2)),
    );
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer).toString("base64");
}
