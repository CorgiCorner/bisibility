import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import { auditKeywordExport } from "@/lib/keywords/export-audit";
import type { HistoryExportAuthority } from "@/lib/rank-history/export-authority";
import { historyExportReportOptions } from "@/lib/rank-history/export-host";
import { rankHistoryCsvHeader, rankHistoryCsvLine } from "@/lib/rank-history/export-service";
import { reportHistoryCsv } from "@/lib/rank-history/report-export-formats";
import { prepareRankHistoryExport } from "@/lib/rank-history/report-export-service";
import {
  RankReportCapacityError,
  RankReportCursorError,
  RankReportSelectionError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import { hostRankReportCursorCodec } from "@/lib/rank-reports/host-cursor";
import { type ApiContext, requireApiActor } from "./context";
import { errorResponse, listResponse } from "./responses";
import { scopedProject, snakeizeKeys } from "./surface";

function query(ctx: ApiContext) {
  const p = ctx.url.searchParams;
  return {
    version: p.get("version") ?? undefined,
    format:
      p.get("format") ?? (ctx.req.headers.get("accept")?.includes("text/csv") ? "csv" : "json"),
    granularity: p.get("granularity") ?? undefined,
    range: p.get("range") ?? undefined,
    keywordIds: p.has("keyword_id") ? p.getAll("keyword_id") : undefined,
    cursor: p.get("cursor") ?? undefined,
    limit: p.get("limit") ?? undefined,
    stream: p.get("stream") ?? undefined,
    basis: p.get("basis") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    aggregation: p.get("aggregation") ?? undefined,
  };
}
function authority(ctx: ApiContext): HistoryExportAuthority {
  const actor = requireApiActor(ctx);
  const kind = ctx.origin.credentialKind;
  if (kind !== "project_key" && kind !== "personal_token" && kind !== "oauth_client")
    throw new AuthorizationError("forbidden");
  return {
    actor,
    transport: kind === "project_key" ? "project_key" : "personal_token",
    credentialId: ctx.origin.credentialId,
    credential: { kind, id: ctx.origin.credentialId },
  };
}
function legacyJson(
  row: Awaited<ReturnType<typeof prepareRankHistoryExport>>["legacyRows"][number],
) {
  return {
    checked_at: row.checkedAt.toISOString(),
    id: row.id,
    keyword: row.keyword,
    keyword_id: row.keywordId,
    normalization_version: row.normalizationVersion ?? null,
    position: row.position,
    previous_position: row.previousPosition,
    provider: row.provider ?? null,
    ranking_url: row.rankingUrl,
    requested_depth: row.requestedDepth ?? null,
  };
}
export async function exportRankHistory(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  try {
    const context = authority(ctx);
    const prepared = await prepareRankHistoryExport(context, query(ctx), projectId, {
      codec: hostRankReportCursorCodec(),
      firstAsOf: new Date(),
      reportAt: (at) => historyExportReportOptions(context, at),
    });
    // Only V2 signed cursors prove continuation. V1 retains per-response audit semantics.
    if (prepared.input.version === "1" || !prepared.input.cursor)
      await auditKeywordExport(
        ctx.actorId ?? null,
        prepared.project.id,
        prepared.project.publicId,
        prepared.meta.summary.retainedHistory.targets,
        prepared.input.format,
        "history",
      );
    if (prepared.input.format === "csv") {
      // Every row and the snapshot are validated before the response becomes observable.
      const body =
        prepared.input.version === "1"
          ? [rankHistoryCsvHeader, ...prepared.legacyRows.map(rankHistoryCsvLine)].join("\n")
          : reportHistoryCsv(prepared);
      const headers = new Headers(ctx.headers);
      headers.set("Content-Type", "text/csv; charset=utf-8");
      headers.set(
        "Content-Disposition",
        `attachment; filename="bisibility-rank-history-${prepared.project.publicId}.csv"`,
      );
      headers.set("X-Bisibility-Report-As-Of", prepared.meta.asOf);
      headers.set("X-Bisibility-Report-Version", prepared.input.version);
      return new Response(body, { headers });
    }
    if (prepared.input.version === "1")
      return listResponse(prepared.legacyPage.map(legacyJson), prepared.nextCursor, {
        headers: ctx.headers,
      });
    return listResponse(prepared.reportPage.map(snakeizeKeys), prepared.nextCursor, {
      headers: ctx.headers,
      meta: { report: snakeizeKeys(prepared.meta) },
    });
  } catch (error) {
    const init = { headers: ctx.headers, instance: ctx.instance };
    if (error instanceof RankReportCapacityError)
      return errorResponse("bad_request", error.message, 413, {
        ...init,
        problemDetails: { reason: error.code },
      });
    if (error instanceof RankReportSnapshotConflictError)
      return errorResponse("conflict", error.message, 409, init);
    if (error instanceof RankReportCursorError)
      return errorResponse(
        "invalid_cursor",
        "Restart this export; the cursor is invalid or belongs to another snapshot.",
        400,
        init,
      );
    if (error instanceof RankReportSelectionError)
      return errorResponse("not_found", error.message, 404, init);
    if (error instanceof AuthorizationError)
      return errorResponse("forbidden", "The export scope is unavailable.", 403, init);
    throw error;
  }
}
