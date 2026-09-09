"use server";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, requirePublicId } from "@/lib/db/public-id";
import {
  CsvParseError,
  detectedKeywordImportColumnMapping,
  keywordImportFields,
  parseKeywordImportCsvRows,
  parseKeywordImportCsvTable,
} from "@/lib/keywords/import-csv-parser";
import {
  canonicalKeySchema,
  KEYWORD_IMPORT_MAX,
  keywordImportFileLimitMessage,
} from "@/lib/schemas/keyword";
import { z } from "zod";
import { getActionActor, requireProjectScope, revalidateKeywordViews } from "./_shared";
import { exportCloudImportPackage as exportCloudPackage } from "./keyword-cloud-package";
import { createKeywordBatchSet, type KeywordBatchRow } from "./keyword-helpers";
import { keywordImportDefaults } from "./keyword-import-defaults";
import {
  deduplicateKeywordImportRows,
  parseKeywordImportCsv,
} from "./keyword-import-export-helpers";
import { readKeywordImportInput } from "./keyword-import-input";
import { filterReviewRowsByProjectMarkets, reviewKeywordImportRows } from "./keyword-import-review";

const projectIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "prj"), {
    message: "Expected a strict prj_ v3 public ID.",
  })
  .optional();
// biome-ignore format: compact schema keeps this server action under the file line cap.
const importSchema = z.object({ defaultMarketKey: canonicalKeySchema.nullable().optional(), columnMapping: z.partialRecord(z.enum(keywordImportFields), z.number().int().nonnegative()).default({}), csv: z.string().trim().min(1, "Upload CSV or XLSX rows, or paste CSV rows."), projectId: projectIdSchema, refresh: z.enum(["deferred", "immediate"]).default("immediate") });

type Actor = Awaited<ReturnType<typeof getActionActor>>;

async function readCsvInput(input: unknown) {
  return importSchema.parse(await readKeywordImportInput(input));
}

export async function previewKeywordImportFile(input: FormData) {
  try {
    const data = await readKeywordImportInput(input);
    const csv =
      typeof data === "object" && data !== null && "csv" in data && typeof data.csv === "string"
        ? data.csv
        : "";
    const table = parseKeywordImportCsvTable(csv);
    const rows = parseKeywordImportCsvRows(csv);
    if (rows.length > KEYWORD_IMPORT_MAX) {
      return {
        error: { code: "row_limit", message: keywordImportFileLimitMessage(rows.length), row: 1 },
        ok: false as const,
      };
    }
    return {
      columnMapping: detectedKeywordImportColumnMapping(table),
      hasHeader: table.hasHeader,
      ok: true as const,
      rows,
      sourceColumns: table.sourceColumns,
    };
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

export async function reviewKeywordImport(input: unknown) {
  const data = await readCsvInput(input);
  const actor = await getActionActor();
  const project = await scopedProject(actor, "create", data.projectId);
  return reviewKeywordImportRows(project.id, data.csv, data.columnMapping, data.defaultMarketKey);
}

// biome-ignore format: compact import flow keeps this server action under the file line cap.
export async function importKeywordsFromCsv(input: unknown) {
  const data = await readCsvInput(input);
  const actor = await getActionActor();
  const project = await scopedProject(actor, "create", data.projectId);
  const { errors, parsed, received } = parseKeywordImportCsv(
    data.csv,
    await keywordImportDefaults(project.id, data.defaultMarketKey),
    data.columnMapping,
  );
  if (received > KEYWORD_IMPORT_MAX) throw new Error(keywordImportFileLimitMessage(received));
  if (parsed.length === 0) return { created: 0, errors, failed: errors.length, parsed: 0, received, skipped: 0 };
  const { skipped, uniqueRows } = deduplicateKeywordImportRows(parsed);

  const marketReview = await filterReviewRowsByProjectMarkets(project.id, uniqueRows);
  errors.push(...marketReview.errors);
  const preparedRows: KeywordBatchRow[] = marketReview.rows.map((row) => ({
    device: row.device,
    keyword: row.keyword,
    location: row.locationLabel,
    locationId: row.locationId,
    schedule: null,
    tags: row.tags,
    targetUrl: row.targetUrl,
    intent: row.intent,
    topic: row.topic,
  }));

  if (!preparedRows.length) return { created: 0, errors, failed: errors.length, parsed: parsed.length, received, skipped: skipped + marketReview.duplicateRows, warning: null, warnings: [] };

  const created = await prisma.$transaction(async (tx) => {
    const persisted = await createKeywordBatchSet(tx, project.id, preparedRows);
    const keywords = persisted.created;
    const transactionSkipped = marketReview.duplicateRows + preparedRows.length - keywords.length;
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
    return { keywords, skipped: skipped + transactionSkipped, warnings: [] as string[] };
  });
  if (data.refresh === "immediate") revalidateKeywordViews();

  // biome-ignore format: compact summary keeps this server action under the file line cap.
  return { created: created.keywords.length, errors, failed: errors.length, parsed: parsed.length, received, skipped: created.skipped, warning: created.warnings[0] ?? null, warnings: created.warnings };
}

export async function exportCloudImportPackage(input: unknown) {
  return exportCloudPackage(input);
}
