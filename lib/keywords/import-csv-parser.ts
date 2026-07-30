export type KeywordImportCsvColumns = {
  city: number;
  device: number;
  intent: number;
  keyword: number;
  location: number;
  locationKey: number;
  tags: number;
  targetUrl: number;
  topic: number;
};

export type KeywordImportCsvTable = {
  columns: KeywordImportCsvColumns;
  dataRows: string[][];
  firstDataRowNumber: number;
  hasHeader: boolean;
  rows: string[][];
};

export type KeywordImportCsvRow = {
  city?: string;
  device?: string;
  intent?: string;
  keyword: string;
  location?: string;
  locationKey?: string;
  row: number;
  tags?: string[];
  targetUrl?: string;
  topic?: string;
};

export const MALFORMED_CSV_MESSAGE = "Malformed CSV: quoted field is missing a closing quote.";
export const INVALID_UTF8_CSV_MESSAGE =
  "CSV import files must be UTF-8 encoded. Re-export the file as UTF-8 and try again.";
export const REPLACEMENT_CHARACTER_CSV_MESSAGE =
  "CSV import contains replacement characters (�). Re-export the source as UTF-8 and try again.";
export const LEGACY_XLS_IMPORT_MESSAGE =
  "Legacy .xls files are not supported. Save the workbook as .xlsx and try again.";

export type CsvParseErrorCode =
  | "malformed_csv"
  | "invalid_encoding"
  | "missing_required_column"
  | "unsupported_delimiter";

export class CsvParseError extends Error {
  readonly code: CsvParseErrorCode;
  readonly row: number;

  constructor(row: number, options: { code?: CsvParseErrorCode; message?: string } = {}) {
    super(options.message ?? MALFORMED_CSV_MESSAGE);
    this.code = options.code ?? "malformed_csv";
    this.name = "CsvParseError";
    this.row = row;
  }
}

export function decodeKeywordImportCsv(buffer: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new CsvParseError(1, { code: "invalid_encoding", message: INVALID_UTF8_CSV_MESSAGE });
  }
}

type CsvParserState = {
  field: string;
  quoted: boolean;
  quotedFieldRow: number | null;
  recordRow: number;
  row: string[];
  rows: string[][];
};

function consumeQuote(state: CsvParserState, next: string | undefined) {
  if (state.quoted && next === '"') {
    state.field += '"';
    return true;
  }
  state.quoted = !state.quoted;
  state.quotedFieldRow = state.quoted ? state.recordRow : null;
  return false;
}

function consumeComma(state: CsvParserState) {
  if (state.quoted) state.field += ",";
  else {
    state.row.push(state.field.trim());
    state.field = "";
  }
}

function consumeNewline(state: CsvParserState, char: string, next: string | undefined) {
  if (state.quoted) {
    state.field += char;
    return false;
  }
  state.row.push(state.field.trim());
  if (state.row.some(Boolean)) state.rows.push(state.row);
  state.field = "";
  state.recordRow += 1;
  state.row = [];
  return char === "\r" && next === "\n";
}

function consumeCsvCharacter(state: CsvParserState, char: string, next: string | undefined) {
  switch (char) {
    case '"':
      return consumeQuote(state, next);
    case ",":
      consumeComma(state);
      return false;
    case "\n":
    case "\r":
      return consumeNewline(state, char, next);
    default:
      state.field += char;
      return false;
  }
}

export function parseCsvRows(value: string) {
  const state: CsvParserState = {
    field: "",
    quoted: false,
    quotedFieldRow: null,
    recordRow: 1,
    row: [],
    rows: [],
  };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (consumeCsvCharacter(state, char, next)) index += 1;
  }

  if (state.quoted) throw new CsvParseError(state.quotedFieldRow ?? state.recordRow);
  state.row.push(state.field.trim());
  if (state.row.some(Boolean)) state.rows.push(state.row);
  return state.rows;
}

export function headerKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const columnAliases = {
  city: ["city"],
  device: ["device"],
  intent: ["intent"],
  keyword: ["keyword", "keywords", "query"],
  location: ["country", "geo", "location"],
  locationKey: ["locationkey"],
  tags: ["tag", "tags"],
  targetUrl: ["targeturl", "url"],
  topic: ["topic"],
} as const;
const recognizedHeaderAliases = new Set<string>(Object.values(columnAliases).flat());

function columnIndex(header: string[], names: string[], fallback: number) {
  const aliases = new Set(names);
  const index = header.findIndex((cell) => aliases.has(headerKey(cell)));
  if (index !== -1) return index;
  return header.length === 0 ? fallback : -1;
}

export function splitKeywordImportTags(value: string) {
  return value
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function unsupportedDelimiter(csv: string, rows: string[][]) {
  if (rows.length === 0 || rows.some((row) => row.length !== 1)) return null;
  const firstLine = csv.split(/\r\n|\n|\r/, 1)[0] ?? "";
  if (firstLine.split(";").length >= 2) {
    return {
      message:
        "This file appears to use semicolons (;) as separators. Export it as comma-separated CSV and try again.",
    };
  }
  if (firstLine.split("\t").length >= 2) {
    return {
      message:
        "This file appears to use tabs as separators. Export it as comma-separated CSV and try again.",
    };
  }
  return null;
}

export function parseKeywordImportCsvTable(csv: string): KeywordImportCsvTable {
  // Treat U+FFFD as evidence of an earlier lossy decode so mojibake never reaches storage,
  // even though the replacement character can also be intentional Unicode content.
  if (csv.includes("\uFFFD")) {
    throw new CsvParseError(1, {
      code: "invalid_encoding",
      message: REPLACEMENT_CHARACTER_CSV_MESSAGE,
    });
  }
  const rows = parseCsvRows(csv);
  const delimiter = unsupportedDelimiter(csv, rows);
  if (delimiter) {
    throw new CsvParseError(1, { code: "unsupported_delimiter", message: delimiter.message });
  }
  const firstRow = rows[0] ?? [];
  const keywordAliases = new Set<string>(columnAliases.keyword);
  const hasKeywordHeader = firstRow.some((cell) => keywordAliases.has(headerKey(cell)));
  const recognizedHeaderCount = firstRow.filter((cell) =>
    recognizedHeaderAliases.has(headerKey(cell)),
  ).length;
  const hasHeader = hasKeywordHeader || recognizedHeaderCount >= 2;
  if (hasHeader && !hasKeywordHeader) {
    throw new CsvParseError(1, {
      code: "missing_required_column",
      message: 'Missing required keyword column. Add a column named "keyword" and try again.',
    });
  }
  const header = hasHeader ? rows[0] : [];
  return {
    columns: {
      city: columnIndex(header, [...columnAliases.city], -1),
      device: columnIndex(header, [...columnAliases.device], 4),
      intent: columnIndex(header, [...columnAliases.intent], -1),
      keyword: columnIndex(header, [...columnAliases.keyword], 0),
      location: columnIndex(header, [...columnAliases.location], 3),
      locationKey: columnIndex(header, [...columnAliases.locationKey], -1),
      tags: columnIndex(header, [...columnAliases.tags], 2),
      targetUrl: columnIndex(header, [...columnAliases.targetUrl], 1),
      topic: columnIndex(header, [...columnAliases.topic], -1),
    },
    dataRows: rows.slice(hasHeader ? 1 : 0),
    firstDataRowNumber: hasHeader ? 2 : 1,
    hasHeader,
    rows,
  };
}

function optionalCell(row: string[], index: number) {
  if (index < 0) return undefined;
  const value = row[index]?.trim();
  return value || undefined;
}

export function parseKeywordImportCsvRows(csv: string): KeywordImportCsvRow[] {
  const table = parseKeywordImportCsvTable(csv);
  return table.dataRows.map((row, offset) => ({
    city: optionalCell(row, table.columns.city),
    device: optionalCell(row, table.columns.device),
    intent: optionalCell(row, table.columns.intent),
    keyword: row[table.columns.keyword]?.trim() ?? "",
    location: optionalCell(row, table.columns.location),
    locationKey: optionalCell(row, table.columns.locationKey),
    row: offset + table.firstDataRowNumber,
    tags: optionalCell(row, table.columns.tags)
      ? splitKeywordImportTags(row[table.columns.tags] ?? "")
      : undefined,
    targetUrl: optionalCell(row, table.columns.targetUrl),
    topic: optionalCell(row, table.columns.topic),
  }));
}

export function parseKeywordImportCsvKeywords(csv: string) {
  return parseKeywordImportCsvRows(csv)
    .map((row) => row.keyword)
    .filter(Boolean);
}
