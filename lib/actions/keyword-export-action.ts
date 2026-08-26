"use server";

import { whereCompletedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, requirePublicId } from "@/lib/db/public-id";
import { auditKeywordExport } from "@/lib/keywords/export-audit";
import {
  type KeywordExportSelection,
  keywordExportSelectionSchema,
} from "@/lib/keywords/keyword-export-contract";
import { resolveAuthorizedRankTrackerExportKeywordIds } from "@/lib/queries/rank-tracker-selection";
import { loadRankHistoryExport } from "@/lib/rank-history/export-service";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { assertCloudImportPackageLimits } from "./keyword-export-limits";
import {
  keywordExportColumns,
  keywordExportOptions,
  serializeKeywordExportCsv,
  serializeKeywordExportXlsx,
} from "./keyword-import-export-helpers";
import { keywordExportJson } from "./keyword-import-export-json";

const projectIdSchema = z.string().refine((value) => isPublicIdOfType(value, "prj"), {
  message: "Expected a strict prj_ v3 public ID.",
});
const exportSchema = z
  .object({
    columns: z.partialRecord(z.enum(keywordExportColumns), z.boolean()).default({}),
    format: z.enum(["csv", "json", "xlsx"]).default("csv"),
    granularity: z.enum(["daily", "weekly"]).default("daily"),
    projectId: projectIdSchema,
    range: z.enum(["30", "90", "all"]).default("30"),
    scope: z.enum(["current", "history"]).default("current"),
    selection: keywordExportSelectionSchema,
  })
  .strict();
const mimeTypes = {
  csv: "text/csv",
  json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

async function loadCurrentKeywords(projectId: string, keywordIds?: string[]) {
  if (keywordIds?.length === 0) return [];
  const keywords = await prisma.keyword.findMany({
    include: {
      rankChecks: { orderBy: { checkedAt: "desc" }, where: whereCompletedChecks() },
      tags: { include: { tag: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    where: { projectId, ...(keywordIds ? { publicId: { in: keywordIds } } : {}) },
  });
  if (!keywordIds) return keywords;
  const byId = new Map(keywords.map((keyword) => [keyword.publicId, keyword]));
  return keywordIds.flatMap((id) => {
    const keyword = byId.get(id);
    return keyword ? [keyword] : [];
  });
}

async function resolveSelection(
  project: { domain: string | null; id: string },
  selection: KeywordExportSelection,
) {
  if (selection.mode === "all") return undefined;
  if (selection.mode === "selected") return selection.keywordIds;
  return resolveAuthorizedRankTrackerExportKeywordIds(project, selection.query);
}

export async function exportKeywords(input: unknown) {
  const data = parseActionInput(exportSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "keyword" });
  const keywordIds = await resolveSelection(project, data.selection);
  const keywords =
    data.scope === "history"
      ? (
          await loadRankHistoryExport({
            actor,
            format: data.format,
            granularity: data.granularity,
            keywordIds,
            projectId: project.id,
            range: data.range,
          })
        ).keywords
      : await loadCurrentKeywords(project.id, keywordIds);
  if (data.scope !== "history") assertCloudImportPackageLimits(keywords);
  const options = keywordExportOptions(data);
  const content =
    data.format === "json"
      ? JSON.stringify(keywordExportJson(keywords, options, project.publicId), null, 2)
      : data.format === "xlsx"
        ? await serializeKeywordExportXlsx(keywords, options)
        : serializeKeywordExportCsv(keywords, options);
  if (data.scope !== "history") {
    await auditKeywordExport(
      actor.id,
      project.id,
      requirePublicId(project.publicId, "prj"),
      keywords.length,
      data.format,
      data.scope,
    );
  }
  return {
    content,
    count: keywords.length,
    encoding: data.format === "xlsx" ? "base64" : "utf8",
    filename: `bisibility-keywords-${project.publicId}-${data.scope}.${data.format}`,
    mimeType: mimeTypes[data.format],
  };
}
