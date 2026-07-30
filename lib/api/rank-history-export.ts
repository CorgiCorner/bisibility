import "server-only";

import {
  loadRankHistoryExport,
  rankHistoryCsvHeader,
  rankHistoryCsvLine,
  rankHistoryRows,
} from "@/lib/rank-history/export-service";
import { z } from "zod";
import type { ApiContext } from "./context";
import { paginateArray } from "./pagination";
import { requireApiPublicId } from "./public-id";
import { listResponse } from "./responses";
import { runDomain, scopedProject } from "./surface";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).optional(),
  granularity: z.enum(["daily", "weekly"]).default("daily"),
  keywordIds: z.array(z.string().trim().min(1).max(120)).max(500).optional(),
  range: z.enum(["30", "90", "all"]).default("30"),
});

function query(ctx: ApiContext) {
  return querySchema.parse({
    format: ctx.url.searchParams.get("format") ?? undefined,
    granularity: ctx.url.searchParams.get("granularity") ?? undefined,
    keywordIds: ctx.url.searchParams.getAll("keyword_id").length
      ? ctx.url.searchParams.getAll("keyword_id").map((id) => requireApiPublicId(id, "kw"))
      : undefined,
    range: ctx.url.searchParams.get("range") ?? undefined,
  });
}

function responseFormat(ctx: ApiContext, requested?: "csv" | "json") {
  if (requested) return requested;
  return ctx.req.headers.get("accept")?.includes("text/csv") ? "csv" : "json";
}

function jsonRow(row: ReturnType<typeof rankHistoryRows>[number]) {
  return {
    checked_at: row.checkedAt.toISOString(),
    id: requireApiPublicId(row.id, "check"),
    keyword: row.keyword,
    keyword_id: requireApiPublicId(row.keywordId, "kw"),
    position: row.position,
    previous_position: row.previousPosition,
    ranking_url: row.rankingUrl,
  };
}

function publicRows(rows: ReturnType<typeof rankHistoryRows>) {
  return rows.map((row) => ({
    ...row,
    id: requireApiPublicId(row.id, "check"),
    keywordId: requireApiPublicId(row.keywordId, "kw"),
  }));
}

function csvResponse(ctx: ApiContext, projectId: string, rows: ReturnType<typeof rankHistoryRows>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${rankHistoryCsvHeader}\n`));
      for (const row of rows) controller.enqueue(encoder.encode(`${rankHistoryCsvLine(row)}\n`));
      controller.close();
    },
  });
  const headers = new Headers(ctx.headers);
  headers.set(
    "Content-Disposition",
    `attachment; filename="bisibility-rank-history-${projectId}.csv"`,
  );
  headers.set("Content-Type", "text/csv; charset=utf-8");
  return new Response(stream, { headers });
}

export async function exportRankHistory(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = query(ctx);
  const format = responseFormat(ctx, input.format);
  const loaded = await runDomain(() =>
    loadRankHistoryExport({
      actor: ctx.actor as NonNullable<ApiContext["actor"]>,
      auditActorId: ctx.actorId,
      format,
      granularity: input.granularity,
      keywordIds: input.keywordIds,
      projectId: ctx.auth.project.id,
      range: input.range,
    }),
  );
  const rows = publicRows(rankHistoryRows(loaded, input.granularity));
  const publicProjectId = requireApiPublicId(loaded.project.publicId ?? "", "prj");
  if (format === "csv") return csvResponse(ctx, publicProjectId, rows);

  const { nextCursor, page } = paginateArray(ctx.url, rows, 50, 200);
  return listResponse(page.map(jsonRow), nextCursor, { headers: ctx.headers });
}
