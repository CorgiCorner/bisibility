import ExcelJS from "exceljs";

export {
  type KeywordImportRow,
  keywordImportKey,
  parseKeywordImportCsv,
} from "./keyword-import-csv";

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
