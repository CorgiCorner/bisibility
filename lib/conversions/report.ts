import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  canonicalPagePathSql,
  canonicalProjectHost,
  pagePathForProject,
} from "@/lib/pages/page-path";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { readOrganicSessionsConnection } from "@/lib/search-insights/sync/sessions-credentials";
import { previousPeriod, utcDay } from "./dates";
import {
  getConversionPageTotals,
  getConversionSeries,
  getConversionSources,
  getConversionTotals,
} from "./queries";
import { resolveConversionSource } from "./selection";
import type { ConversionLandingPage, ConversionReport } from "./surface";
import type { ConversionPeriod, ConversionSource } from "./types";

export type { ConversionLandingPage, ConversionReport };

function rate(conversions: number, sessions: number | null) {
  if (sessions == null || sessions <= 0) return null;
  return conversions / sessions;
}

function addSessions(map: Map<string, number>, domain: string, path: string, sessions: number) {
  const canonical = pagePathForProject(domain, path);
  if (!canonical) return;
  map.set(canonical, (map.get(canonical) ?? 0) + sessions);
}

async function sessionsByPath(
  projectId: string,
  domain: string,
  source: ConversionSource,
  period: ConversionPeriod,
) {
  const map = new Map<string, number>();
  if (source === "ga4") {
    const connection = await readOrganicSessionsConnection(projectId);
    const property = connection.connection?.property;
    if (!property) return map;
    const rows = await prisma.organicSessionsPageDaily.groupBy({
      _sum: { sessions: true },
      by: ["path"],
      where: {
        date: { gte: utcDay(period.from), lte: utcDay(period.to) },
        projectId,
        property,
      },
    });
    for (const row of rows) addSessions(map, domain, row.path, row._sum.sessions ?? 0);
    return map;
  }
  const host = canonicalProjectHost(domain);
  if (!host) return map;
  const rows = await prisma.$queryRaw<{ path: string; sessions: number }[]>`
    SELECT path, sessions
    FROM (
      SELECT DISTINCT ON (snapshot.path)
        snapshot.sessions AS sessions,
        ${canonicalPagePathSql(Prisma.sql`snapshot.path`, host)} AS path
      FROM "page_traffic_snapshots" snapshot
      WHERE snapshot."projectId" = ${projectId}
        AND snapshot.provider = 'plausible'
        AND snapshot."windowDays" = 28
      ORDER BY snapshot.path, snapshot.date DESC
    ) raw
    WHERE path IS NOT NULL
  `;
  for (const row of rows) map.set(row.path, (map.get(row.path) ?? 0) + row.sessions);
  return map;
}

export async function loadConversionReport(
  projectRef: string,
  period: ConversionPeriod,
  requested?: string | null,
  options: { pageLimit?: number; previous?: ConversionPeriod } = {},
): Promise<ConversionReport> {
  const project = await prisma.project.findFirst({
    select: { domain: true, id: true },
    where: { OR: [{ id: projectRef }, { publicId: projectRef }] },
  });
  if (!project) return { kind: "connect", selection: resolveConversionSource({ sources: [] }) };
  const sources = await getConversionSources(project.id);
  const selection = resolveConversionSource({ requested, sources });
  if (selection.connect || !selection.selected) return { kind: "connect", selection };
  const source = selection.selected;
  const previous = options.previous ?? previousPeriod(period);
  const limit = options.pageLimit ?? 8;
  const domain = trackedProjectDomain(project.domain);
  const [currentTotals, previousTotals, series, pageTotals, sessions] = await Promise.all([
    getConversionTotals(project.id, period),
    getConversionTotals(project.id, previous),
    getConversionSeries(project.id, period, source),
    getConversionPageTotals(project.id, period, source),
    domain
      ? sessionsByPath(project.id, domain, source, period)
      : Promise.resolve(new Map<string, number>()),
  ]);
  const current = currentTotals.find((row) => row.source === source);
  const prior = previousTotals.find((row) => row.source === source);
  const pages = [...pageTotals.pages]
    .sort(
      (left, right) => right.totalCount - left.totalCount || left.path.localeCompare(right.path),
    )
    .slice(0, limit)
    .map((page) => {
      const sessionCount = sessions.has(page.path) ? (sessions.get(page.path) ?? null) : null;
      return {
        conversions: page.totalCount,
        path: page.path,
        rate: rate(page.totalCount, sessionCount),
        sessions: sessionCount,
      };
    });
  return {
    current: current?.totalCount ?? 0,
    goalCount: current?.goals.length ?? 0,
    kind: "ready",
    pages,
    previous: prior?.totalCount ?? 0,
    selection,
    series: series.points.map((point) => ({ date: point.date, totalCount: point.totalCount })),
    source,
    sourceLabel: selection.options.find((option) => option.source === source)?.label ?? source,
  };
}
