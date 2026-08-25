"use server";

import { writeAudit } from "@/lib/auth/audit";
import { whereCompletedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, requirePublicId } from "@/lib/db/public-id";
import { auditKeywordExport } from "@/lib/keywords/export-audit";
import {
  CsvParseError,
  detectedKeywordImportColumnMapping,
  keywordImportFields,
  parseKeywordImportCsvRows,
  parseKeywordImportCsvTable,
} from "@/lib/keywords/import-csv-parser";
import { loadRankHistoryExport } from "@/lib/rank-history/export-service";
import { KEYWORD_IMPORT_MAX, keywordImportFileLimitMessage } from "@/lib/schemas/keyword";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
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
  deduplicateKeywordImportRows,
  keywordExportColumns,
  keywordExportOptions,
  parseKeywordImportCsv,
  serializeKeywordExportCsv,
  serializeKeywordExportXlsx,
} from "./keyword-import-export-helpers";
import { keywordExportJson } from "./keyword-import-export-json";
import { readKeywordImportInput } from "./keyword-import-input";
import { reviewKeywordImportRows } from "./keyword-import-review";

const projectIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "prj"), {
    message: "Expected a strict prj_ v3 public ID.",
  })
  .optional();
const keywordIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "kw"), { message: "Keyword not found." });

// biome-ignore format: compact schema keeps this server action under the file line cap.
const importSchema = z.object({ columnMapping: z.partialRecord(z.enum(keywordImportFields), z.number().int().nonnegative()).default({}), csv: z.string().trim().min(1, "Upload CSV or XLSX rows, or paste CSV rows."), projectId: projectIdSchema, refresh: z.enum(["deferred", "immediate"]).default("immediate") });

// biome-ignore format: compact schema keeps this server action under the file line cap.
const exportSchema = z.object({ columns: z.partialRecord(z.enum(keywordExportColumns), z.boolean()).default({}), format: z.enum(["csv", "json", "xlsx"]).default("csv"), granularity: z.enum(["daily", "weekly"]).default("daily"), keywordIds: z.array(keywordIdSchema).max(500).optional(), projectId: projectIdSchema, range: z.enum(["30", "90", "all"]).default("30"), scope: z.enum(["current", "history"]).default("current") });
// biome-ignore format: compact map keeps this server action under the file line cap.
const exportMimeTypes = { csv: "text/csv", json: "application/json", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;

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
