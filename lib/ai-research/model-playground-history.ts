import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { nativeHistoryKey } from "@/lib/model-playground/history-label";
import {
  combinedReportedCost,
  modelPlaygroundReportSchema,
} from "@/lib/model-playground/report-body";
import type { HistoryQuery, HistoryRow } from "@/lib/research-history/contract";
import { HISTORY_SCAN_BOUND } from "@/lib/research-history/contract";
import { historyCostFromCents, historyCostFromReceipt } from "@/lib/research-history/cost";
import {
  assembleHistoryPage,
  decodeHistoryCursor,
  filterValue,
  historyTake,
  pinnedOnly,
  sliceHistoryIds,
} from "@/lib/research-history/page";
import { projectHistoryTimeZone } from "@/lib/research-history/pins";
import { countValue, ilike, keysetSql, textValues } from "@/lib/research-history/sql";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function promptOf(body: unknown, title: string) {
  const prompt = record(record(body)?.input)?.prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt.trim() : title;
}

function enginesOf(body: unknown, native: boolean) {
  if (native && record(body)?.format === "model_playground") {
    const parsed = modelPlaygroundReportSchema.safeParse(body);
    return parsed.success
      ? [
          ...new Set(
            parsed.data.input.columns.map((column) =>
              nativeHistoryKey(column.providerId, column.modelId),
            ),
          ),
        ]
      : [];
  }
  const input = record(record(body)?.input);
  const listed = strings(input?.engines);
  if (listed.length) return [...new Set(listed)];
  const models = strings(input?.models);
  if (models.length) return [...new Set(models)];
  const rows = record(record(body)?.result)?.rows;
  const named = (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const item = record(row);
    if (typeof item?.engine === "string" && item.engine) return [item.engine];
    if (typeof item?.model === "string" && item.model) return [item.model];
    return [];
  });
  return [...new Set(named)];
}

function costOf(body: unknown, native: boolean) {
  if (native && record(body)?.format === "model_playground") {
    const parsed = modelPlaygroundReportSchema.safeParse(body);
    return parsed.success
      ? combinedReportedCost(parsed.data.results)
      : { kind: "unknown" as const };
  }
  const root = record(body);
  const result = record(root?.result);
  const cached = result?.costCents === 0 && result.costStatus !== "unknown";
  const receipt = historyCostFromReceipt(root?.originalPayment, cached);
  if (receipt.kind !== "unknown") return receipt;
  if (result?.costStatus === "unknown") return { kind: "unknown" as const };
  return typeof result?.costCents === "number"
    ? historyCostFromCents(result.costCents)
    : { kind: "unknown" as const };
}

function searchSql(query: string) {
  const title = ilike(Prisma.sql`title`, query);
  const prompt = ilike(Prisma.sql`COALESCE(body#>>'{input,prompt}', '')`, query);
  return query.trim() ? Prisma.sql`(${title} OR ${prompt})` : Prisma.sql`TRUE`;
}

function nativeReportSql() {
  return Prisma.sql`(provenance->>'source'='model_playground'
    AND provenance->>'runId'=body->>'runId'
    AND EXISTS (SELECT 1 FROM model_playground_runs run
      WHERE run."projectId"=agent_reports."projectId" AND run."reportId"=agent_reports.id
        AND run.id=body->>'runId'))`;
}

function engineSql(engine: string | null) {
  if (!engine) return Prisma.sql`TRUE`;
  const payload = JSON.stringify([engine]);
  return Prisma.sql`(
    (jsonb_typeof(body #> '{input,engines}') = 'array' AND body #> '{input,engines}' @> ${payload}::jsonb)
    OR (jsonb_typeof(body #> '{input,models}') = 'array' AND body #> '{input,models}' @> ${payload}::jsonb)
    OR (${nativeReportSql()} AND body->>'format' = 'model_playground' AND body->>'version' = '1' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(body#>'{input,columns}')='array' THEN body#>'{input,columns}' ELSE '[]'::jsonb END) column_config
      WHERE 'api:' || (column_config->>'providerId') || ':' || (column_config->>'modelId') = ${engine}
    ))
  )`;
}

function pinSql(userId: string, enabled: boolean) {
  if (!enabled) return Prisma.sql`TRUE`;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM research_history_pins pin
    WHERE pin."userId" = ${userId}
      AND pin."projectId" = agent_reports."projectId"
      AND pin.surface = 'model_playground'::"ResearchHistorySurface"
      AND pin."itemKey" = agent_reports."publicId"
  )`;
}

function arrayElements(path: string) {
  return Prisma.raw(
    `jsonb_array_elements_text(CASE WHEN jsonb_typeof(body #> '${path}') = 'array' THEN body #> '${path}' ELSE '[]'::jsonb END)`,
  );
}

/**
 * Engine names live in `input.engines` or `input.models`. Prisma can filter either
 * array, so the page filter stays in the database. Chips use a bounded DISTINCT.
 */
export async function readModelPlaygroundHistory(
  projectId: string,
  userId: string,
  request: HistoryQuery,
  now?: Date,
) {
  const cursor = decodeHistoryCursor(request.cursor);
  const engine = filterValue(request.filters, "engine");
  const pinned = pinnedOnly(request.filters);
  const searched = Prisma.sql`"projectId" = ${projectId} AND kind = 'prompt_explorer' AND ${searchSql(request.query)}`;
  const matched = Prisma.sql`${searched} AND ${engineSql(engine)} AND ${pinSql(userId, pinned)}`;
  const take = historyTake(request.limit);
  const [timeZone, idRows, totals, pinnedTotals, engineRows] = await Promise.all([
    projectHistoryTimeZone(projectId),
    prisma.$queryRaw<Array<{ createdAt: Date; id: string }>>`
      SELECT id, "createdAt" AS "createdAt"
      FROM agent_reports
      WHERE ${matched} AND ${keysetSql("createdAt", cursor)}
      ORDER BY "createdAt" DESC, id DESC
      LIMIT ${take}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM agent_reports WHERE ${matched}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM agent_reports WHERE ${searched} AND ${pinSql(userId, true)}
    `,
    prisma.$queryRaw<Array<{ value: string }>>`
      SELECT DISTINCT engine AS value FROM (
        SELECT ${arrayElements("{input,engines}")} AS engine
        FROM agent_reports WHERE ${searched}
        UNION
        SELECT ${arrayElements("{input,models}")} AS engine
        FROM agent_reports WHERE ${searched}
        UNION
        SELECT 'api:' || (column_config->>'providerId') || ':' || (column_config->>'modelId') AS engine
        FROM agent_reports CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(body#>'{input,columns}')='array' THEN body#>'{input,columns}' ELSE '[]'::jsonb END) column_config
        WHERE ${searched} AND ${nativeReportSql()} AND body->>'format'='model_playground' AND body->>'version'='1'
      ) engines
      WHERE engine <> ''
      ORDER BY engine
      LIMIT ${HISTORY_SCAN_BOUND}
    `,
  ]);
  const page = sliceHistoryIds(
    idRows.map((row) => ({ at: new Date(row.createdAt), id: row.id })),
    request.limit,
  );
  const reports =
    page.rows.length === 0
      ? []
      : await prisma.agentReport.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            body: true,
            provenance: true,
            createdAt: true,
            id: true,
            publicId: true,
            title: true,
            modelPlaygroundRun: { select: { id: true } },
          },
          take: page.rows.length,
          where: { projectId, id: { in: page.rows.map((row) => row.id) } },
        });
  const pins =
    reports.length === 0
      ? []
      : await prisma.researchHistoryPin.findMany({
          select: { itemKey: true },
          take: page.rows.length,
          where: {
            itemKey: { in: reports.map((report) => report.publicId) },
            projectId,
            surface: "model_playground",
            userId,
          },
        });
  const pinnedKeys = new Set(pins.map((pin) => pin.itemKey));
  const rows: HistoryRow[] = reports.map((report) => {
    const native =
      record(report.provenance)?.source === "model_playground" &&
      record(report.provenance)?.runId === record(report.body)?.runId &&
      report.modelPlaygroundRun?.id === record(report.body)?.runId;
    return {
      cost: costOf(report.body, native),
      key: report.publicId,
      meta: { engines: enginesOf(report.body, native), kind: "model" },
      occurredAt: report.createdAt.toISOString(),
      pinned: pinnedKeys.has(report.publicId),
      title: promptOf(report.body, report.title),
    };
  });
  return assembleHistoryPage({
    chips: textValues(engineRows).map((value) => ({ facet: "engine" as const, value })),
    nextCursor: page.nextCursor,
    now,
    pinnedCount: countValue(pinnedTotals),
    rows,
    timeZone,
    total: countValue(totals),
  });
}
