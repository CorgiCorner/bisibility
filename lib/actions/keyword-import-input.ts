import {
  decodeKeywordImportCsv,
  LEGACY_XLS_IMPORT_MESSAGE,
} from "@/lib/keywords/import-csv-parser";
import ExcelJS from "exceljs";

const maxFileBytes = 5 * 1024 * 1024;
const spreadsheetTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const isSpreadsheetUpload = (file: Blob & { name?: string }) =>
  /\.xlsx$/i.test(file.name ?? "") || spreadsheetTypes.has(file.type);

const isLegacyXlsUpload = (file: Blob & { name?: string }) =>
  /\.xls$/i.test(file.name ?? "") ||
  (!(file.name ?? "") && file.type === "application/vnd.ms-excel");

function validateImportFile(file: Blob) {
  if (file.size > maxFileBytes) {
    throw new Error("Keyword import files must be 5 MB or smaller.");
  }
}

async function textFileContent(file: Blob) {
  return decodeKeywordImportCsv(await file.arrayBuffer());
}

function workbookCellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => String(part?.text ?? "")).join("");
  }
  if ("result" in value) return workbookCellText(value.result as ExcelJS.CellValue);
  return JSON.stringify(value);
}

const spreadsheetCsvCell = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

async function spreadsheetToCsv(file: Blob) {
  const workbook = new ExcelJS.Workbook();
  try {
    // biome-ignore format: bridges ExcelJS' ArrayBuffer-like type and the Node Buffer runtime path.
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error("Could not read the spreadsheet import.");
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return "";
  const rows: string[][] = [];
  worksheet.eachRow((row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] = workbookCellText(cell.value);
    });
    while (values.at(-1) === "") values.pop();
    if (values.some(Boolean)) rows.push(values);
  });
  return rows.map((row) => row.map(spreadsheetCsvCell).join(",")).join("\n");
}

async function importTextFrom(value: FormDataEntryValue | null) {
  if (!value) return "";
  if (typeof value === "string") return value;
  validateImportFile(value);
  if (isLegacyXlsUpload(value)) throw new Error(LEGACY_XLS_IMPORT_MESSAGE);
  return isSpreadsheetUpload(value) ? spreadsheetToCsv(value) : textFileContent(value);
}

function readColumnMapping(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Column mapping is invalid. Return to Map columns and try again.");
  }
}

export async function readKeywordImportInput(input: unknown) {
  if (typeof FormData === "undefined" || !(input instanceof FormData)) return input;
  const projectId = input.get("projectId");
  const refresh = input.get("refresh");
  const defaultMarketKey = input.get("defaultMarketKey");
  return {
    defaultMarketKey:
      typeof defaultMarketKey === "string" && defaultMarketKey ? defaultMarketKey : null,
    columnMapping: readColumnMapping(input.get("columnMapping")),
    csv: await importTextFrom(input.get("file") ?? input.get("csv")),
    projectId: typeof projectId === "string" ? projectId : undefined,
    refresh: typeof refresh === "string" ? refresh : undefined,
  };
}
