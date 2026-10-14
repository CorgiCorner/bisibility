"use server";

import { isPublicIdOfType, requirePublicId } from "@/lib/db/public-id";
import { auditKeywordExport } from "@/lib/keywords/export-audit";
import { keywordExportSelectionSchema } from "@/lib/keywords/keyword-export-contract";
import {
  defaultRankTrackerReportScope,
  rankTrackerScope,
  resolveRankTrackerReportTime,
} from "@/lib/keywords/rank-tracker-report-scope";
import { legacyHistoryFromSnapshot } from "@/lib/rank-history/bounded-history";
import { historyExportReportOptions } from "@/lib/rank-history/export-host";
import { loadHistoryExportSnapshot } from "@/lib/rank-history/export-snapshot";
import { reportHistoryCsv } from "@/lib/rank-history/report-export-formats";
import { prepareRankHistoryExport } from "@/lib/rank-history/report-export-service";
import { reportHistoryXlsx } from "@/lib/rank-history/report-export-xlsx";
import { hostRankReportCursorCodec } from "@/lib/rank-reports/host-cursor";
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
    historyVersion: z.union([z.literal(1), z.literal(2)]).default(1),
    stream: z.enum(["observations", "attempts"]).default("observations"),
    basis: z.enum(["observed_at", "recorded_at"]).default("recorded_at"),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
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

export async function exportKeywords(input: unknown) {
  const data = parseActionInput(exportSchema, input);
  const reportTime = resolveRankTrackerReportTime(
    data.selection.mode === "query"
      ? rankTrackerScope(data.selection.query)
      : data.selection.mode === "selected"
        ? (data.selection.reportScope ?? defaultRankTrackerReportScope)
        : defaultRankTrackerReportScope,
  );
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "keyword" });
  if (
    data.historyVersion === 1 &&
    (data.from || data.to || data.stream !== "observations" || data.basis !== "recorded_at")
  )
    throw new Error("Explicit report windows/streams require historyVersion 2.");
  if (data.historyVersion === 2) {
    if (data.scope !== "history") throw new Error("Report version 2 requires history scope.");
    const context = { actor, transport: "session" as const };
    const prepared = await prepareRankHistoryExport(
      context,
      {
        version: "2",
        format: data.format === "xlsx" ? "json" : data.format,
        granularity: data.granularity,
        range: data.range,
        stream: data.stream,
        basis: data.basis,
        from: data.from,
        to: data.to,
        keywordIds: data.selection.mode === "selected" ? data.selection.keywordIds : undefined,
      },
      project.publicId,
      {
        codec: hostRankReportCursorCodec(),
        firstAsOf: reportTime.asOf,
        reportAt: (at) => historyExportReportOptions(context, at, reportTime.comparisonDays),
      },
      data.selection.mode === "query" ? data.selection.query : undefined,
    );
    const content =
      data.format === "csv"
        ? reportHistoryCsv(prepared)
        : data.format === "xlsx"
          ? await reportHistoryXlsx(prepared)
          : JSON.stringify({ data: prepared.reportRows, meta: prepared.meta }, null, 2);
    await auditKeywordExport(
      actor.id,
      project.id,
      requirePublicId(project.publicId, "prj"),
      prepared.meta.summary.retainedHistory.targets,
      data.format,
      "history",
    );
    return {
      content,
      count: prepared.meta.summary.retainedHistory.targets,
      encoding: data.format === "xlsx" ? "base64" : "utf8",
      filename: `bisibility-keywords-${project.publicId}-history-v2.${data.format}`,
      mimeType: mimeTypes[data.format],
    };
  }
  const context = { actor, transport: "session" as const };
  const snapshot = await loadHistoryExportSnapshot(
    context,
    {
      projectId: project.publicId,
      keywordIds: data.selection.mode === "selected" ? data.selection.keywordIds : undefined,
      query: data.selection.mode === "query" ? data.selection.query : undefined,
    },
    historyExportReportOptions(context, reportTime.asOf, reportTime.comparisonDays),
  );
  // V1 current preserves its former last-completed input; only history applies the requested range here.
  const history = legacyHistoryFromSnapshot(snapshot, {
    range: data.scope === "current" ? "all" : data.range,
    keywordIds: data.selection.mode === "selected" ? data.selection.keywordIds : undefined,
  });
  const keywords = history.keywords;
  if (data.scope !== "history") assertCloudImportPackageLimits(keywords);
  const options = {
    ...keywordExportOptions(data),
    ...(history?.asOf ? { asOf: new Date(history.asOf) } : {}),
  };
  const content =
    data.format === "json"
      ? JSON.stringify(keywordExportJson(keywords, options, project.publicId), null, 2)
      : data.format === "xlsx"
        ? await serializeKeywordExportXlsx(keywords, options)
        : serializeKeywordExportCsv(keywords, options);
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
    mimeType: mimeTypes[data.format],
  };
}
