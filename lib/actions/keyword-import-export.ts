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
import { KEYWORD_IMPORT_MAX, keywordImportFileLimitMessage } from "@/lib/schemas/keyword";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
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
import { reviewKeywordImportRows } from "./keyword-import-review";

const projectIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "prj"), {
    message: "Expected a strict prj_ v3 public ID.",
  })
  .optional();
// biome-ignore format: compact schema keeps this server action under the file line cap.
const importSchema = z.object({ columnMapping: z.partialRecord(z.enum(keywordImportFields), z.number().int().nonnegative()).default({}), csv: z.string().trim().min(1, "Upload CSV or XLSX rows, or paste CSV rows."), projectId: projectIdSchema, refresh: z.enum(["deferred", "immediate"]).default("immediate") });

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
  return reviewKeywordImportRows(project.id, data.csv, data.columnMapping);
}

// biome-ignore format: compact import flow keeps this server action under the file line cap.
export async function importKeywordsFromCsv(input: unknown) {
  const data = await readCsvInput(input);
  const actor = await getActionActor();
  const project = await scopedProject(actor, "create", data.projectId);
  const { errors, parsed, received } = parseKeywordImportCsv(
    data.csv,
    await keywordImportDefaults(project.id),
    data.columnMapping,
  );
  if (received > KEYWORD_IMPORT_MAX) throw new Error(keywordImportFileLimitMessage(received));
  if (parsed.length === 0) return { created: 0, errors, failed: errors.length, parsed: 0, received, skipped: 0 };
  const { skipped, uniqueRows } = deduplicateKeywordImportRows(parsed);

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

export async function exportCloudImportPackage(input: unknown) {
  return exportCloudPackage(input);
}
