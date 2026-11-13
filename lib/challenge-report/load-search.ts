import "server-only";

import type { ChartMarker } from "@/lib/annotations/marker-style";
import { completeSeriesEnd } from "@/lib/charts/complete-day";
import { prisma } from "@/lib/db/prisma";
import { pagePathForProject } from "@/lib/pages/page-path";
import { readChartAnnotations } from "@/lib/queries/chart-annotations";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { dateFromKey, dateKey } from "@/lib/search-insights/dates";
import { buildDailyClickPoints } from "@/lib/search-insights/queries/daily-clicks-model";
import { readSearchInsightsConnection } from "@/lib/search-insights/sync/credentials";
import { addDays, type ChallengePeriod } from "./period";
import { unavailableTile } from "./tile-state";
import { buildClicksTile, buildExistingVsNewTile, buildTopPagesTile } from "./tiles-search";

async function dailyClicks(projectId: string, property: string, period: ChallengePeriod) {
  const end = completeSeriesEnd({
    now: new Date(),
    requestedEnd: period.to,
    timeZone: "UTC",
  });
  const rows = await prisma.searchAnalyticsDaily.findMany({
    orderBy: { date: "asc" },
    select: { clicks: true, date: true },
    where: {
      date: { gte: dateFromKey(period.from), lte: dateFromKey(end) },
      projectId,
      property,
      searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
    },
  });
  return buildDailyClickPoints(
    period.from,
    end,
    rows.map((row) => ({ clicks: row.clicks, dateKey: dateKey(row.date) })),
  );
}

function landingPath(domain: string | null, page: string) {
  if (domain) {
    const path = pagePathForProject(domain, page);
    if (path) return path;
  }
  try {
    return new URL(page).pathname || "/";
  } catch {
    return page.startsWith("/") ? page : `/${page}`;
  }
}

export async function loadClicksTile(
  projectId: string,
  period: ChallengePeriod,
  previous: ChallengePeriod,
) {
  const connection = await readSearchInsightsConnection(projectId);
  if (!connection.connection) return unavailableTile("not_connected", "search_console");
  const property = connection.connection.property;
  const [current, earlier, markers] = await Promise.all([
    dailyClicks(projectId, property, period),
    dailyClicks(projectId, property, previous),
    readChartAnnotations(projectId, { fromKey: period.from, toKey: period.to }).catch(() => []),
  ]);
  return buildClicksTile({
    connected: true,
    current,
    markers: markers as ChartMarker[],
    previous: earlier,
  });
}

export async function loadTopPagesTile(projectId: string, period: ChallengePeriod) {
  const connection = await readSearchInsightsConnection(projectId);
  if (!connection.connection) return unavailableTile("not_connected", "search_console");
  const project = await prisma.project.findUnique({
    select: { domain: true },
    where: { id: projectId },
  });
  const rows = await prisma.searchAnalyticsPageDaily.groupBy({
    _sum: { clicks: true },
    by: ["page"],
    where: {
      date: { gte: dateFromKey(period.from), lte: dateFromKey(period.to) },
      projectId,
      property: connection.connection.property,
      searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
    },
  });
  const totals = new Map<string, number>();
  for (const row of rows) {
    const path = landingPath(project?.domain ?? null, row.page);
    totals.set(path, (totals.get(path) ?? 0) + (row._sum.clicks ?? 0));
  }
  return buildTopPagesTile({
    connected: true,
    pages: [...totals.entries()].map(([path, clicks]) => ({ clicks, path })),
  });
}

export async function loadExistingVsNewTile(
  projectId: string,
  period: ChallengePeriod,
  snapshotId?: string,
) {
  const snapshot = await prisma.pageSnapshot.findFirst({
    select: {
      id: true,
      pageCount: true,
      pages: { select: { page: { select: { path: true } } } },
      takenOn: true,
    },
    where: { projectId, ...(snapshotId ? { id: snapshotId } : { archivedAt: null }) },
  });
  if (!snapshot)
    return buildExistingVsNewTile({
      connected: false,
      existingClicks: 0,
      existingPages: 0,
      hasSnapshot: false,
      newClicks: 0,
      newPages: 0,
    });
  const connection = await readSearchInsightsConnection(projectId);
  if (!connection.connection) {
    return buildExistingVsNewTile({
      connected: false,
      existingClicks: 0,
      existingPages: snapshot.pageCount,
      hasSnapshot: true,
      newClicks: 0,
      newPages: 0,
    });
  }
  const project = await prisma.project.findUnique({
    select: { domain: true },
    where: { id: projectId },
  });
  const paths = new Set(snapshot.pages.map((row) => row.page.path));
  const [rows, newPages] = await Promise.all([
    prisma.searchAnalyticsPageDaily.groupBy({
      _sum: { clicks: true },
      by: ["page"],
      where: {
        date: { gte: dateFromKey(period.from), lte: dateFromKey(period.to) },
        projectId,
        property: connection.connection.property,
        searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
      },
    }),
    prisma.projectPage.count({
      where: {
        firstSeenAt: { gt: snapshot.takenOn, lte: dateFromKey(addDays(period.to, 1)) },
        projectId,
        snapshotPages: { none: { snapshotId: snapshot.id } },
      },
    }),
  ]);
  let existingClicks = 0;
  let newClicks = 0;
  for (const row of rows) {
    const clicks = row._sum.clicks ?? 0;
    const path = landingPath(project?.domain ?? null, row.page);
    if (paths.has(path)) existingClicks += clicks;
    else newClicks += clicks;
  }
  return buildExistingVsNewTile({
    connected: true,
    existingClicks,
    existingPages: snapshot.pageCount,
    hasSnapshot: true,
    newClicks,
    newPages,
  });
}
