import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { SEARCH_INSIGHTS_SOURCE } from "@/lib/search-insights/sync/credentials";
import { readActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import {
  decodeProjectRunsCursor,
  type ProjectRunsPlannedSortTuple,
  type ProjectRunsSortTuple,
} from "./cursor";
import type { ProjectRunsQuery, ProjectRunsStatus } from "./filters";
import type { ProjectRunGscImport } from "./project-run";
import { type ProjectRunsApiResponse, projectRunsApiResponseSchema } from "./project-runs-api";
import {
  adjustedGscCount,
  GSC_ACTIVE_IMPORT_STATES,
  gscSnapshotMatchesStatus,
  rawGscSnapshotMatchesStatus,
} from "./project-runs-gsc-snapshot";
import { filtersFor, pageProjectRuns } from "./project-runs-page";
import {
  gscImportSelect,
  gscProjectRun,
  type ProjectRunsPresentationProject,
  rankProjectRun,
  rankRunSelect,
} from "./project-runs-presentation";

const RANK_ACTIVE_STATUSES = ["queued", "running", "cancelling"] as const;
const RANK_FINISHED_STATUSES = ["completed", "cancelled"] as const;
const GSC_ATTENTION_PAUSE_REASONS = ["error", "needs_reauth", "user"] as const;
const GSC_FINISHED_STATES = ["completed", "failed"] as const;

type ProjectRunsProject = Readonly<{ id: string; name?: string; publicId: string }>;

function rankStatusWhere(status: ProjectRunsStatus): Prisma.RankCheckRunWhereInput {
  if (status === "active") return { status: { in: [...RANK_ACTIVE_STATUSES] } };
  if (status === "attention") {
    return { OR: [{ status: "blocked" }, { outcome: "failed", status: "completed" }] };
  }
  if (status === "finished") return { status: { in: [...RANK_FINISHED_STATUSES] } };
  return {};
}

function rankWhere(
  projectId: string,
  query: ProjectRunsQuery,
  launched: boolean,
): Prisma.RankCheckRunWhereInput {
  const membership = launched
    ? { launchedAt: { not: null } }
    : { finishedAt: { not: null }, launchedAt: null, status: "cancelled" };
  return { AND: [{ projectId, deletedAt: null }, membership, rankStatusWhere(query.status)] };
}

function plannedWhere(projectId: string, status: ProjectRunsStatus): Prisma.RankCheckRunWhereInput {
  const statusWhere =
    status === "attention" ? { status: "blocked" } : status === "all" ? {} : { id: { in: [] } };
  return {
    AND: [
      {
        projectId,
        deletedAt: null,
        launchedAt: null,
        plannedFor: { not: null },
        status: { in: ["planned", "blocked"] },
      },
      statusWhere,
    ],
  };
}

function gscWhere(
  projectId: string,
  query: ProjectRunsQuery,
  attentionSnapshotId: string | null = null,
): Prisma.SearchAnalyticsImportWhereInput | null {
  if (query.view === "planned") return null;
  const rawStatus =
    query.status === "active"
      ? {
          OR: [
            { state: { in: [...GSC_ACTIVE_IMPORT_STATES] } },
            { pausedReason: "rate_limited", state: "paused" },
          ],
        }
      : query.status === "attention"
        ? {
            OR: [
              { state: "failed" },
              { pausedReason: { in: [...GSC_ATTENTION_PAUSE_REASONS] }, state: "paused" },
            ],
          }
        : query.status === "finished"
          ? { state: { in: [...GSC_FINISHED_STATES] } }
          : {};
  const status =
    query.status === "attention" && attentionSnapshotId
      ? { OR: [rawStatus, { id: attentionSnapshotId }] }
      : rawStatus;
  return {
    AND: [
      { projectId, searchType: SEARCH_INSIGHTS_SEARCH_TYPE, source: SEARCH_INSIGHTS_SOURCE },
      status,
    ],
  };
}

function rankCursorWhere(
  where: Prisma.RankCheckRunWhereInput,
  field: "createdAt" | "finishedAt" | "launchedAt",
  cursor: ProjectRunsSortTuple | null,
) {
  if (!cursor) return where;
  const at = new Date(cursor.sortAt);
  if (cursor.kind === "gsc_import") {
    return { AND: [where, { [field]: { lte: at } }] };
  }
  return {
    AND: [where, { OR: [{ [field]: { lt: at } }, { [field]: at, publicId: { gt: cursor.id } }] }],
  };
}

function gscCursorWhere(
  where: Prisma.SearchAnalyticsImportWhereInput,
  cursor: ProjectRunsSortTuple | null,
) {
  if (!cursor) return where;
  const at = new Date(cursor.sortAt);
  const equal = cursor.kind === "gsc_import" ? { createdAt: at, id: { gt: cursor.id } } : null;
  return { AND: [where, { OR: [{ createdAt: { lt: at } }, ...(equal ? [equal] : [])] }] };
}

function plannedCursorWhere(
  where: Prisma.RankCheckRunWhereInput,
  cursor: ProjectRunsPlannedSortTuple | null,
) {
  if (!cursor) return where;
  const at = new Date(cursor.plannedFor);
  return {
    AND: [
      where,
      { OR: [{ plannedFor: { gt: at } }, { plannedFor: at, publicId: { gt: cursor.id } }] },
    ],
  };
}

async function presentationProject(
  project: ProjectRunsProject,
): Promise<ProjectRunsPresentationProject> {
  if (project.name) return project as ProjectRunsPresentationProject;
  const stored = await prisma.project.findUnique({
    select: { name: true },
    where: { id: project.id },
  });
  if (!stored) throw new Error("Project not found.");
  return { ...project, name: stored.name };
}

export async function listProjectRuns(
  project: ProjectRunsProject,
  query: ProjectRunsQuery,
): Promise<ProjectRunsApiResponse> {
  const displayProject = await presentationProject(project);
  if (query.view === "planned") return listPlannedProjectRuns(project.id, displayProject, query);
  const cursor = decodeProjectRunsCursor(query.cursor, {
    ...filtersFor(query),
    view: "runs",
  } as const);
  const take = query.limit + 1;
  const includeRanks = query.source !== "search_console";
  const includeGsc = query.source !== "rank_checks";
  const includeUpcoming = includeRanks && (query.status === "all" || query.status === "attention");
  const upcomingWhere = plannedWhere(project.id, query.status);
  const activeSnapshot =
    includeGsc && query.status !== "finished"
      ? await readActiveSearchImportSnapshot(project.id)
      : null;
  const snapshotIsAttention =
    activeSnapshot && gscSnapshotMatchesStatus(activeSnapshot, "attention");
  const snapshotLeavesRawStatus = Boolean(
    activeSnapshot &&
      rawGscSnapshotMatchesStatus(activeSnapshot, query.status) &&
      !gscSnapshotMatchesStatus(activeSnapshot, query.status),
  );
  const launchedWhere = rankCursorWhere(rankWhere(project.id, query, true), "launchedAt", cursor);
  const cancelledWhere = rankCursorWhere(rankWhere(project.id, query, false), "finishedAt", cursor);
  const importsWhere = gscWhere(project.id, query, snapshotIsAttention ? activeSnapshot.id : null);
  const importCountWhere = gscWhere(project.id, query);
  const importTake = take + Number(snapshotIsAttention || snapshotLeavesRawStatus);
  const [
    launched,
    cancelled,
    imports,
    launchedCount,
    cancelledCount,
    importCount,
    upcoming,
    upcomingCount,
  ] = await Promise.all([
    includeRanks
      ? prisma.rankCheckRun.findMany({
          orderBy: [{ launchedAt: "desc" }, { publicId: "asc" }],
          select: rankRunSelect,
          take,
          where: launchedWhere,
        })
      : [],
    includeRanks
      ? prisma.rankCheckRun.findMany({
          orderBy: [{ finishedAt: "desc" }, { publicId: "asc" }],
          select: rankRunSelect,
          take,
          where: cancelledWhere,
        })
      : [],
    includeGsc && importsWhere
      ? prisma.searchAnalyticsImport.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: gscImportSelect,
          take: importTake,
          where: gscCursorWhere(importsWhere, cursor),
        })
      : [],
    includeRanks ? prisma.rankCheckRun.count({ where: rankWhere(project.id, query, true) }) : 0,
    includeRanks ? prisma.rankCheckRun.count({ where: rankWhere(project.id, query, false) }) : 0,
    includeGsc && importCountWhere
      ? prisma.searchAnalyticsImport.count({ where: importCountWhere })
      : 0,
    includeUpcoming
      ? prisma.rankCheckRun.findMany({
          orderBy: [{ createdAt: "desc" }, { publicId: "asc" }],
          select: rankRunSelect,
          take,
          where: rankCursorWhere(upcomingWhere, "createdAt", cursor),
        })
      : [],
    includeUpcoming ? prisma.rankCheckRun.count({ where: upcomingWhere }) : 0,
  ]);
  const candidates = [
    ...launched.map((row) => rankProjectRun(row, displayProject)),
    ...cancelled.map((row) => rankProjectRun(row, displayProject)),
    ...upcoming.map((row) => rankProjectRun(row, displayProject)),
    ...imports
      .map((row) => gscProjectRun(row, displayProject, activeSnapshot))
      .filter((row): row is ProjectRunGscImport => row !== null),
  ];
  const page = pageProjectRuns(candidates, query);
  const rankChecks = launchedCount + cancelledCount + upcomingCount;
  const searchConsole = adjustedGscCount(importCount, activeSnapshot, query.status);
  return projectRunsApiResponseSchema.parse({
    counts: { rankChecks, searchConsole, total: rankChecks + searchConsole },
    nextCursor: page.nextCursor,
    runs: page.data,
  });
}

async function listPlannedProjectRuns(
  projectId: string,
  project: ProjectRunsPresentationProject,
  query: ProjectRunsQuery,
): Promise<ProjectRunsApiResponse> {
  if (query.source === "search_console") {
    return projectRunsApiResponseSchema.parse({
      counts: { rankChecks: 0, searchConsole: 0, total: 0 },
      nextCursor: null,
      runs: [],
    });
  }
  const cursor = decodeProjectRunsCursor(query.cursor, {
    ...filtersFor(query),
    view: "planned",
  } as const);
  const where = plannedCursorWhere(plannedWhere(projectId, query.status), cursor);
  const [rows, rankChecks] = await Promise.all([
    prisma.rankCheckRun.findMany({
      orderBy: [{ plannedFor: "asc" }, { publicId: "asc" }],
      select: rankRunSelect,
      take: query.limit + 1,
      where,
    }),
    prisma.rankCheckRun.count({ where: plannedWhere(projectId, query.status) }),
  ]);
  const page = pageProjectRuns(
    rows.map((row) => rankProjectRun(row, project)),
    query,
  );
  return projectRunsApiResponseSchema.parse({
    counts: { rankChecks, searchConsole: 0, total: rankChecks },
    nextCursor: page.nextCursor,
    runs: page.data,
  });
}

export { matchesProjectRunsQuery, pageProjectRuns } from "./project-runs-page";
