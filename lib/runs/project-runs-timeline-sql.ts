import { Prisma } from "@/lib/generated/prisma/client";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { SEARCH_INSIGHTS_SOURCE } from "@/lib/search-insights/sync/credentials";
import type { ActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import {
  AI_COST_SKIP_REASONS,
  AI_QUIET_STATES,
  AI_RUN_STATUS_KEYS,
  AI_TERMINAL_STATES,
} from "./ai-run-state";
import type { ProjectRunsTimelineSortTuple } from "./cursor";
import type { ProjectRunsQuery } from "./filters";
import { gscActiveSnapshotRunState, gscSnapshotStatusKey } from "./project-runs-gsc-snapshot";
import { timelineAscending } from "./project-runs-timeline";

export type TimelineRow = {
  group: 0 | 1 | 2;
  id: string;
  kind: "gsc" | "rank" | "ai";
  publicId: string;
  sortAt: Date;
};

export function timelineCandidatesSql(
  projectId: string,
  query: ProjectRunsQuery,
  snapshot: ActiveSearchImportSnapshot | null,
) {
  const live = snapshot ? gscActiveSnapshotRunState(snapshot) : null;
  const liveActive = live
    ? ["queued", "running", "waiting_for_first_data", "waiting_to_resume"].includes(live.lifecycle)
    : false;
  const key = snapshot ? gscSnapshotStatusKey(snapshot) : null;
  return Prisma.sql`
    WITH candidates AS (
      SELECT r.id, r."publicId", 'rank'::text AS kind,
        CASE WHEN r.status IN ('completed', 'cancelled') THEN 2
          WHEN r.status IN ('running', 'cancelling') OR (r.status = 'blocked' AND r."startedAt" IS NOT NULL) THEN 0 ELSE 1 END AS "group",
        CASE WHEN r.status IN ('completed', 'cancelled') THEN COALESCE(r."finishedAt", r."launchedAt", r."createdAt")
          WHEN r.status IN ('running', 'cancelling') OR (r.status = 'blocked' AND r."startedAt" IS NOT NULL) THEN COALESCE(r."startedAt", r."launchedAt", r."createdAt")
          ELSE COALESCE((SELECT MIN(i."notBefore") FROM rank_check_run_items i WHERE i."runId" = r.id AND i.status = 'queued'), r."plannedFor", r."launchedAt", r."createdAt") END AS "sortAt",
        CASE WHEN r.status = 'completed' AND r.outcome = 'cancelled' THEN 'cancelled'
          WHEN r.status = 'completed' AND r."blockedReason" = 'no_active_keywords' AND r."startedAt" IS NULL THEN 'skipped'
          WHEN r.status = 'completed' THEN COALESCE(r.outcome, 'not_confirmed') ELSE r.status END AS "statusKey",
        r.status IN ('queued', 'running', 'cancelling') AS active,
        (r.status = 'blocked' OR (r.status = 'completed' AND r.outcome = 'failed')) AS attention
      FROM rank_check_runs r
      WHERE r."projectId" = ${projectId} AND r."deletedAt" IS NULL AND ${query.source === "all" || query.source === "rank_checks"}
      UNION ALL
      SELECT g.id, g.id AS "publicId", 'gsc'::text AS kind,
        CASE WHEN g.state IN ('completed', 'failed') THEN 2
          WHEN g.id = ${snapshot?.id ?? null} AND ${live?.lifecycle === "queued"} THEN 1
          WHEN g.id <> COALESCE(${snapshot?.id ?? null}, '') AND g.state = 'queued' THEN 1 ELSE 0 END AS "group",
        CASE WHEN g.state IN ('completed', 'failed') THEN COALESCE(g."lastSyncFinishedAt", g."createdAt")
          WHEN g.state = 'queued' OR (g.id = ${snapshot?.id ?? null} AND ${live?.lifecycle === "queued"}) THEN g."createdAt"
          ELSE COALESCE(g."syncStartedAt", g."lastSyncStartedAt", g."createdAt") END AS "sortAt",
        CASE WHEN g.id = ${snapshot?.id ?? null} AND g.state NOT IN ('completed', 'failed') THEN ${key}
          WHEN g.state = 'running' THEN 'importing'
          WHEN g.state = 'waiting_for_first_data' THEN 'waiting_for_data'
          WHEN g.state = 'paused' THEN CASE g."pausedReason"
            WHEN 'user' THEN 'paused' WHEN 'error' THEN 'failed' WHEN 'needs_reauth' THEN 'reconnect_required'
            WHEN 'rate_limited' THEN 'waiting_for_google' ELSE 'status_unavailable' END
          WHEN g.state IN ('queued', 'completed', 'failed') THEN g.state ELSE 'status_unavailable' END AS "statusKey",
        CASE WHEN g.id = ${snapshot?.id ?? null} AND g.state NOT IN ('completed', 'failed') THEN ${liveActive}
          ELSE (g.state IN ('queued', 'running', 'waiting_for_first_data') OR (g.state = 'paused' AND g."pausedReason" = 'rate_limited')) END AS active,
        CASE WHEN g.id = ${snapshot?.id ?? null} AND g.state NOT IN ('completed', 'failed') THEN ${Boolean(live?.attention)}
          ELSE (g.state = 'failed' OR (g.state = 'paused' AND g."pausedReason" IN ('error', 'needs_reauth', 'user'))) END AS attention
      FROM search_analytics_imports g
      WHERE g."projectId" = ${projectId} AND g.source = ${SEARCH_INSIGHTS_SOURCE}
        AND g."searchType" = ${SEARCH_INSIGHTS_SEARCH_TYPE} AND ${query.source === "all" || query.source === "search_console"}
      UNION ALL
      SELECT a.id, a."publicId", 'ai'::text AS kind,
        CASE WHEN a.state::text IN (${Prisma.join(AI_TERMINAL_STATES)}) OR a."finishedAt" IS NOT NULL THEN 2 WHEN a.state='running' THEN 0 ELSE 1 END AS "group",
        CASE WHEN a.state::text IN (${Prisma.join(AI_TERMINAL_STATES)}) OR a."finishedAt" IS NOT NULL THEN COALESCE(a."finishedAt", a."createdAt")
          WHEN a.state='running' THEN COALESCE((SELECT MIN(s."claimedAt") FROM ai_tracking_samples s WHERE s."runId"=a.id AND s."projectId"=${projectId}),a."createdAt")
          ELSE COALESCE(a."plannedAt",a."createdAt") END AS "sortAt",
        CASE WHEN a.state='skipped' AND EXISTS (SELECT 1 FROM ai_tracking_samples s WHERE s."projectId"=${projectId} AND s."runId"=a.id AND s.evidence->>'providerStatus' IN (${Prisma.join(AI_COST_SKIP_REASONS)})) THEN 'cost_limit_exceeded'
          WHEN a.state::text IN (${Prisma.join(AI_RUN_STATUS_KEYS)}) THEN a.state::text ELSE 'status_unavailable' END AS "statusKey",
        a.state='running' AS active,
        a.state::text NOT IN (${Prisma.join(AI_QUIET_STATES)}) AS attention
      FROM ai_tracking_runs a WHERE a."projectId"=${projectId} AND ${query.source === "all" || query.source === "ai_tracking"}
    ), filtered AS (
      SELECT * FROM candidates WHERE ${timelineStatusSql(query)} AND ${timelineSectionSql(query)}
    )
  `;
}

function timelineStatusSql(query: ProjectRunsQuery) {
  if (query.status === "all") return Prisma.sql`TRUE`;
  if (query.status === "active") return Prisma.sql`active`;
  if (query.status === "attention") return Prisma.sql`attention`;
  if (query.status === "finished") return Prisma.sql`"group" = 2`;
  return Prisma.sql`"statusKey" = ${query.status}`;
}

function timelineSectionSql(query: ProjectRunsQuery) {
  const groups: Record<string, number> = { active: 0, upcoming: 1, history: 2 };
  const group = groups[query.section ?? "all"];
  return group === undefined ? Prisma.sql`TRUE` : Prisma.sql`"group" = ${group}`;
}

export function timelineCursorSql(
  cursor: ProjectRunsTimelineSortTuple | null,
  order: ProjectRunsQuery["order"],
) {
  if (!cursor) return Prisma.sql`TRUE`;
  const at = Prisma.sql`${cursor.sortAt}::timestamp`;
  const afterTime = timelineAscending(cursor.group, order)
    ? Prisma.sql`"sortAt" > ${at}`
    : Prisma.sql`"sortAt" < ${at}`;
  return Prisma.sql`("group" > ${cursor.group} OR ("group" = ${cursor.group} AND
    (${afterTime} OR ("sortAt" = ${at} AND (kind > ${cursor.kind} OR (kind = ${cursor.kind} AND "publicId" > ${cursor.id}))))))`;
}

export function timelineOrderSql(order: ProjectRunsQuery["order"]) {
  return Prisma.sql`ORDER BY "group" ASC,
    CASE WHEN ${order === "asc"} OR (${order !== "desc"} AND "group" <> 2) THEN "sortAt" END ASC,
    CASE WHEN ${order === "desc"} OR (${order !== "asc"} AND "group" = 2) THEN "sortAt" END DESC,
    kind ASC, "publicId" ASC`;
}
