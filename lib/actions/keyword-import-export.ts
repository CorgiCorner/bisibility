"use server";

import { writeAudit } from "@/lib/auth/audit";
import { whereCompletedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, requirePublicId } from "@/lib/db/public-id";
import { auditKeywordExport } from "@/lib/keywords/export-audit";
import {
  CsvParseError,
  decodeKeywordImportCsv,
  LEGACY_XLS_IMPORT_MESSAGE,
  parseKeywordImportCsvRows,
} from "@/lib/keywords/import-csv-parser";
import { loadRankHistoryExport } from "@/lib/rank-history/export-service";
import { KEYWORD_IMPORT_MAX, keywordImportFileLimitMessage } from "@/lib/schemas/keyword";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import ExcelJS from "exceljs";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateKeywordViews,
} from "./_shared";
import { exportCloudImportPackage as exportCloudPackage } from "./keyword-cloud-package";
import { assertCloudImportPackageLimits } from "./keyword-export-limits";
import { createKeywordBatchSet, type KeywordBatchRow } from "./keyword-helpers";
import { keywordImportDefaults } from "./keyword-import-defaults";
import {
  keywordExportColumns,
  keywordExportOptions,
  keywordImportKey,
  parseKeywordImportCsv,
  serializeKeywordExportCsv,
  serializeKeywordExportXlsx,
} from "./keyword-import-export-helpers";
import { keywordExportJson } from "./keyword-import-export-json";

const projectIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "prj"), {
    message: "Expected a strict prj_ v3 public ID.",
  })
  .optional();
const keywordIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "kw"), { message: "Keyword not found." });

// 5 MB covers far more rows than the import cap while bounding decode/workbook parsing cost.
const KEYWORD_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

// biome-ignore format: compact schema keeps this server action under the file line cap.
const importSchema = z.object({ csv: z.string().trim().min(1, "Upload CSV or XLSX rows, or paste CSV rows."), projectId: projectIdSchema, refresh: z.enum(["deferred", "immediate"]).default("immediate") });

// biome-ignore format: compact schema keeps this server action under the file line cap.
const exportSchema = z.object({ columns: z.partialRecord(z.enum(keywordExportColumns), z.boolean()).default({}), format: z.enum(["csv", "json", "xlsx"]).default("csv"), granularity: z.enum(["daily", "weekly"]).default("daily"), keywordIds: z.array(keywordIdSchema).max(500).optional(), projectId: projectIdSchema, range: z.enum(["30", "90", "all"]).default("30"), scope: z.enum(["current", "history"]).default("current") });
// biome-ignore format: compact map keeps this server action under the file line cap.
const exportMimeTypes = { csv: "text/csv", json: "application/json", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;

type Actor = Awaited<ReturnType<typeof getActionActor>>;

// biome-ignore format: compact set keeps this server action under the file line cap.
const spreadsheetTypes = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

const isSpreadsheetUpload = (file: Blob & { name?: string }) =>
  /\.xlsx$/i.test(file.name ?? "") || spreadsheetTypes.has(file.type);

const isLegacyXlsUpload = (file: Blob & { name?: string }) =>
  /\.xls$/i.test(file.name ?? "") ||
  (!(file.name ?? "") && file.type === "application/vnd.ms-excel");

// biome-ignore format: compact guard keeps this server action under the file line cap.
function validateImportFile(file: Blob) { if (file.size > KEYWORD_IMPORT_MAX_FILE_BYTES) throw new Error("Keyword import files must be 5 MB or smaller."); }

// biome-ignore format: compact decoder keeps this server action under the file line cap.
async function textFileContent(file: Blob) {
  return decodeKeywordImportCsv(await file.arrayBuffer());
}

// biome-ignore format: compact cell coercion keeps this server action under the file line cap.
function workbookCellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => String(part?.text ?? "")).join("");
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

// biome-ignore format: compact FormData parse keeps this server action under the file line cap.
async function readCsvInput(input: unknown) {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    const projectId = input.get("projectId");
    const refresh = input.get("refresh");
    const csv = await importTextFrom(input.get("file") ?? input.get("csv"));
    return importSchema.parse({ csv, projectId: typeof projectId === "string" ? projectId : undefined, refresh: typeof refresh === "string" ? refresh : undefined });
  }
  return importSchema.parse(input);
}

export async function previewKeywordImportFile(input: FormData) {
  try {
    const csv = await importTextFrom(input.get("file"));
    const rows = parseKeywordImportCsvRows(csv);
    if (rows.length > KEYWORD_IMPORT_MAX) {
      return {
        error: { code: "row_limit", message: keywordImportFileLimitMessage(rows.length), row: 1 },
        ok: false as const,
      };
    }
    return { ok: true as const, rows };
  } catch (error) {
    if (!(error instanceof CsvParseError)) throw error;
    return {
      error: { code: error.code, message: error.message, row: error.row },
      ok: false as const,
    };
  }
}

async function scopedProject(actor: Actor, action: "create" | "read", projectId?: string) {
  if (!projectId) throw new Error("Project reference is required.");
  return requireProjectScope(actor, action, projectId, { type: "keyword" });
}

// biome-ignore format: compact import flow keeps this server action under the file line cap.
export async function importKeywordsFromCsv(input: unknown) {
  const data = await readCsvInput(input);
  const actor = await getActionActor();
  const project = await scopedProject(actor, "create", data.projectId);
  const { errors, parsed, received } = parseKeywordImportCsv(data.csv, await keywordImportDefaults(project.id));
  if (received > KEYWORD_IMPORT_MAX) throw new Error(keywordImportFileLimitMessage(received));
  if (parsed.length === 0) return { created: 0, errors, failed: errors.length, parsed: 0, received, skipped: 0 };
  const uniqueRows: typeof parsed = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const row of parsed) {
    const key = keywordImportKey(row);
    if (seen.has(key)) skipped += 1;
    else {
      seen.add(key);
      uniqueRows.push(row);
    }
  }

  const warnings = new Set<string>();
  const registeredMarkets = await prisma.projectMarket.findMany({
    select: { location: { select: { canonicalKey: true } } },
    where: { projectId: project.id, status: { in: ["active", "paused"] } },
  });
  const registeredKeys = new Set(
    registeredMarkets.map((market) => market.location.canonicalKey),
  );
  const locations = new Map<string, Awaited<ReturnType<typeof resolveKeywordLocation>>>();
  const preparedRows: KeywordBatchRow[] = [];
  for (const row of uniqueRows) {
    const locationCacheKey = row.locationKey ?? `${row.location}\u0000${row.city ?? ""}`;
    let resolved = locations.get(locationCacheKey);
    if (!resolved) {
      // biome-ignore format: compact location input keeps this action under the file line cap.
      resolved = await resolveKeywordLocation(row.locationKey ? { projectId: project.id, selection: { canonicalKey: row.locationKey, kind: "city" } } : { city: row.city, country: row.location, projectId: project.id });
      locations.set(locationCacheKey, resolved);
    }
    if (!registeredKeys.has(resolved.location.canonicalKey)) {
      errors.push({
        message: `Market ${resolved.location.canonicalKey} is not tracked by this project. Add it in Settings > Markets first.`,
        row: row.row,
      });
      continue;
    }
    if (resolved.warning) warnings.add(resolved.warning);
    preparedRows.push({
      device: row.device,
      keyword: row.keyword,
      location: denormalizedLocationLabel(resolved.location),
      locationId: resolved.location.id,
      schedule: null,
      tags: row.tags,
      targetUrl: row.targetUrl,
      intent: row.intent,
      topic: row.topic,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const persisted = await createKeywordBatchSet(tx, project.id, preparedRows);
    const keywords = persisted.created;
    const transactionSkipped = uniqueRows.length - keywords.length;
    const targetKeyword = keywords.length === 1 ? keywords[0] : null;
    await writeAudit(
      {
        action: "keyword.csv_import",
        actorId: actor.id,
        after: {
          created: keywords.map((keyword) => keyword.publicId),
          failed: errors.length,
          skipped: skipped + transactionSkipped,
        },
        projectId: project.id,
        targetId: targetKeyword?.publicId ?? requirePublicId(project.publicId, "prj"),
        targetType: targetKeyword ? "keyword" : "project",
      },
      tx,
    );
    return { keywords, skipped: skipped + transactionSkipped, warnings: [...warnings] };
  });
  if (data.refresh === "immediate") revalidateKeywordViews();

  // biome-ignore format: compact summary keeps this server action under the file line cap.
  return { created: created.keywords.length, errors, failed: errors.length, parsed: parsed.length, received, skipped: created.skipped, warning: created.warnings[0] ?? null, warnings: created.warnings };
}

async function loadExportKeywords(projectId: string, keywordIds?: string[]) {
  if (keywordIds?.length === 0) return [];
  // biome-ignore format: compact Prisma shape keeps this server action under the file line cap.
  return prisma.keyword.findMany({
    include: { rankChecks: { orderBy: { checkedAt: "desc" }, where: whereCompletedChecks() }, tags: { include: { tag: true } } }, orderBy: { createdAt: "desc" }, where: { projectId, ...(keywordIds?.length ? { publicId: { in: keywordIds } } : {}) },
  });
}

export async function exportCloudImportPackage(input: unknown) {
  return exportCloudPackage(input);
}

export async function exportKeywords(input: unknown) {
  const data = parseActionInput(exportSchema, input);
  const actor = await getActionActor();
  const project = await scopedProject(actor, "read", data.projectId);
  // biome-ignore format: compact history delegation keeps this server action under the file line cap.
  const keywords = data.scope === "history" ? (await loadRankHistoryExport({ actor, format: data.format, granularity: data.granularity, keywordIds: data.keywordIds, projectId: project.id, range: data.range })).keywords : await loadExportKeywords(project.id, data.keywordIds);
  // Current-scope exports load full rank-check histories and can exhaust memory, so reuse
  // the cloud package cap; history exports are already bounded separately.
  if (data.scope !== "history") assertCloudImportPackageLimits(keywords);
  const options = keywordExportOptions(data);
  let content: string;
  if (data.format === "json") {
    content = JSON.stringify(keywordExportJson(keywords, options, project.publicId), null, 2);
  } else if (data.format === "xlsx") {
    content = await serializeKeywordExportXlsx(keywords, options);
  } else {
    content = serializeKeywordExportCsv(keywords, options);
  }
  if (data.scope !== "history")
    await auditKeywordExport(
      actor.id,
      project.id,
      requirePublicId(project.publicId, "prj"),
      keywords.length,
      data.format,
      data.scope,
    );

  return {
    content,
    count: keywords.length,
    encoding: data.format === "xlsx" ? "base64" : "utf8",
    filename: `bisibility-keywords-${project.publicId}-${data.scope}.${data.format}`,
    mimeType: exportMimeTypes[data.format],
  };
}
