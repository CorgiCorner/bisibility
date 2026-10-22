import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { activeMarketLocationIds, isRunnableKeyword } from "@/lib/rank-check/runnable";
import { readActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import { aiProjectRun, aiRunSelect } from "./ai-project-run";
import { aiRunSummaries } from "./ai-run-summary";
import { decodeProjectRunsCursor, encodeProjectRunsCursor } from "./cursor";
import type { ProjectRunsQuery } from "./filters";
import type { ProjectRun } from "./project-run";
import { projectRunsApiResponseSchema } from "./project-runs-api";
import {
  gscImportSelect,
  gscProjectRun,
  type ProjectRunsPresentationProject,
  rankProjectRun,
  rankRunSelect,
} from "./project-runs-presentation";
import {
  type TimelineRow,
  timelineCandidatesSql,
  timelineCursorSql,
  timelineOrderSql,
} from "./project-runs-timeline-sql";

export async function listProjectRunsTimeline(
  projectId: string,
  project: ProjectRunsPresentationProject,
  query: ProjectRunsQuery,
) {
  const filters = {
    source: query.source,
    status: query.status,
    view: "timeline",
    section: query.section,
    order: query.order,
  } as const;
  const cursor = decodeProjectRunsCursor(query.cursor, filters);
  const snapshot =
    query.source !== "all" && query.source !== "search_console"
      ? null
      : await readActiveSearchImportSnapshot(projectId);
  const candidates = timelineCandidatesSql(projectId, query, snapshot);
  const [pageRows, totals] = await Promise.all([
    prisma.$queryRaw<
      TimelineRow[]
    >(Prisma.sql`${candidates} SELECT id, "publicId", kind, "group", "sortAt" FROM filtered
      WHERE ${timelineCursorSql(cursor, query.order)} ${timelineOrderSql(query.order)} LIMIT ${query.limit + 1}`),
    prisma.$queryRaw<{ kind: string; total: bigint }[]>(
      Prisma.sql`${candidates} SELECT kind, COUNT(*) AS total FROM filtered GROUP BY kind`,
    ),
  ]);
  const selected = pageRows.slice(0, query.limit);
  const aiIds = selected.filter((row) => row.kind === "ai").map((row) => row.id);
  const rankIds = selected.filter((row) => row.kind === "rank").map((row) => row.id);
  const gscIds = selected.filter((row) => row.kind === "gsc").map((row) => row.id);
  const [ranks, imports, activeLocations, ais, aiSummaries] = await Promise.all([
    rankIds.length
      ? prisma.rankCheckRun.findMany({
          select: {
            ...rankRunSelect,
            id: true,
            checkSchedule: {
              select: { keywords: { select: { archivedAt: true, id: true, locationId: true } } },
            },
          },
          where: { id: { in: rankIds }, projectId, deletedAt: null },
        })
      : [],
    gscIds.length
      ? prisma.searchAnalyticsImport.findMany({
          select: gscImportSelect,
          where: { id: { in: gscIds }, projectId },
        })
      : [],
    rankIds.length ? activeMarketLocationIds(projectId, prisma) : new Set<string>(),
    aiIds.length
      ? prisma.aiTrackingRun.findMany({
          select: aiRunSelect,
          where: { projectId, id: { in: aiIds } },
        })
      : [],
    aiRunSummaries(projectId, aiIds),
  ]);
  const byId = new Map<string, ProjectRun>();
  for (const row of ranks) {
    const run = rankProjectRun(row, project);
    // Future scope is live schedule intent; terminal history keeps its materialized snapshot.
    if (
      run.timestamps.launchedAt === null &&
      ["planned", "blocked", "queued"].includes(run.details.status) &&
      row.checkSchedule
    ) {
      const count = row.checkSchedule.keywords.filter((keyword) =>
        isRunnableKeyword(keyword, activeLocations),
      ).length;
      byId.set(`rank:${row.id}`, {
        ...run,
        scope: { description: null, kind: "rank", keywordCount: count },
        progress: { ...run.progress, total: count },
      });
    } else byId.set(`rank:${row.id}`, run);
  }
  for (const row of imports) {
    const run = gscProjectRun(row, project, snapshot);
    if (run) byId.set(`gsc:${row.id}`, run);
  }
  for (const row of ais)
    byId.set(
      `ai:${row.id}`,
      aiProjectRun(
        row,
        project,
        aiSummaries.find((item) => item.runId === row.id),
      ),
    );
  const runs = selected.flatMap((row) => {
    const run = byId.get(`${row.kind}:${row.id}`);
    if (!run) return [];
    return [
      run.kind === "rank" && row.group === 1
        ? { ...run, timestamps: { ...run.timestamps, nextCheckAt: row.sortAt.toISOString() } }
        : run,
    ];
  });
  const rankChecks = Number(totals.find((row) => row.kind === "rank")?.total ?? 0);
  const searchConsole = Number(totals.find((row) => row.kind === "gsc")?.total ?? 0);
  const aiTracking = Number(totals.find((row) => row.kind === "ai")?.total ?? 0);
  const last = selected.at(-1);
  return projectRunsApiResponseSchema.parse({
    counts: {
      rankChecks,
      aiTracking,
      searchConsole,
      total: rankChecks + aiTracking + searchConsole,
    },
    runs,
    nextCursor:
      pageRows.length > query.limit && last
        ? encodeProjectRunsCursor({
            filters,
            sort: {
              group: last.group,
              id: last.publicId,
              kind: last.kind,
              sortAt: last.sortAt.toISOString(),
            },
          })
        : null,
  });
}
