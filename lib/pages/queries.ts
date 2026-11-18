import "server-only";

import { AI_RESEARCH_PROVIDER_ID } from "@/lib/ai-research/catalog-types";
import { getConversionSources } from "@/lib/conversions/queries";
import { disconnectedConversionSource, resolveConversionSource } from "@/lib/conversions/selection";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { syncPauseSelection } from "@/lib/schedules/sync-pauses";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { readSearchInsightsConnection } from "@/lib/search-insights/sync/credentials";
import { readOrganicSessionsConnection } from "@/lib/search-insights/sync/sessions-credentials";
import { type PageColumnFacts, projectPageColumnSources } from "./columns";
import { PROJECT_PAGES_EXPORT_LIMIT } from "./export-csv";
import { mapProjectPageRow, type ProjectPageListRecord } from "./list-row";
import { type ProjectPagesQueryInput, projectPagesListQuery } from "./list-sql";
import { canonicalProjectHost } from "./page-path";
import { getStoredSitemapRead } from "./sitemap-read";
import type { StoredSitemapRead } from "./sitemap-read-model";
import { sitemapListedSql } from "./sitemap-sql";
import { snapshotStatusCtes } from "./status-sql";
import {
  assertProjectPagesListInput,
  emptyProjectPagesCounts,
  type ProjectPagesListInput,
  type ProjectPagesSitemapFilterStatus,
} from "./types";

const emptyFacts: PageColumnFacts = {
  aiCitations: 0,
  aiPages: 0,
  checked: 0,
  ga4Pages: 0,
  keywords: 0,
  listed: 0,
  monthsStored: 0,
  plausiblePages: 0,
  presenceTotal: 0,
  prompts: 0,
  rankPages: 0,
  searchConsolePages: 0,
};

async function readColumnFacts(
  projectId: string,
  properties: { ga4Property: string | null; gscProperty: string | null },
  sitemapRead: StoredSitemapRead | null,
): Promise<PageColumnFacts> {
  const [facts] = await prisma.$queryRaw<PageColumnFacts[]>`
    WITH ${snapshotStatusCtes(projectId, sitemapRead)}
    SELECT
      (SELECT COUNT(*)::int FROM "project_pages" page
        LEFT JOIN "project_page_sources" source ON source."pageId" = page.id AND source.source = 'sitemap'
        WHERE page."projectId" = ${projectId}
          AND ${sitemapListedSql(Prisma.sql`source.detail->>'listed' = 'true'`, Prisma.sql`source."lastSeenAt"`)} IS TRUE) AS listed,
      (SELECT COUNT(*)::int FROM "url_presences"
        WHERE "projectId" = ${projectId} AND "checkedAt" IS NOT NULL) AS checked,
      (SELECT COUNT(*)::int FROM "url_presences" WHERE "projectId" = ${projectId}) AS "presenceTotal",
      (SELECT COUNT(*)::int FROM "project_page_sources" source
        JOIN "project_pages" page ON page.id = source."pageId"
        WHERE page."projectId" = ${projectId} AND source.source = 'search_console') AS "searchConsolePages",
      (SELECT COUNT(DISTINCT to_char(date, 'YYYY-MM'))::int FROM "search_analytics_daily"
        WHERE "projectId" = ${projectId}
          AND property = ${properties.gscProperty}
          AND "searchType" = 'web') AS "monthsStored",
      (SELECT COUNT(DISTINCT path)::int FROM "organic_sessions_page_daily"
        WHERE "projectId" = ${projectId} AND property = ${properties.ga4Property}) AS "ga4Pages",
      (SELECT COUNT(DISTINCT path)::int FROM "page_traffic_snapshots"
        WHERE "projectId" = ${projectId} AND provider = 'plausible') AS "plausiblePages",
      (SELECT COUNT(*)::int FROM "project_page_sources" source
        JOIN "project_pages" page ON page.id = source."pageId"
        WHERE page."projectId" = ${projectId} AND source.source = 'rank_tracker') AS "rankPages",
      (SELECT COUNT(*)::int FROM "keywords"
        WHERE "projectId" = ${projectId} AND "archivedAt" IS NULL) AS keywords,
      (SELECT COUNT(*)::int FROM "project_page_sources" source
        JOIN "project_pages" page ON page.id = source."pageId"
        WHERE page."projectId" = ${projectId} AND source.source = 'ai_citation') AS "aiPages",
      (SELECT COUNT(*)::int FROM "ai_prompts"
        WHERE "projectId" = ${projectId} AND "archivedAt" IS NULL) AS prompts,
      (SELECT COUNT(*)::int FROM "ai_tracking_citations" citation
        JOIN "ai_tracking_samples" sample ON sample.id = citation."sampleId"
        WHERE sample."projectId" = ${projectId}) AS "aiCitations"
  `;
  return facts ?? emptyFacts;
}

export async function getProjectPagesList(projectId: string, input: ProjectPagesListInput) {
  return readProjectPages(projectId, input);
}

/** Bounded single-query export, using exactly the list predicates and ordering. */
export async function getProjectPagesExportList(projectId: string, input: ProjectPagesListInput) {
  return readProjectPages(projectId, input, PROJECT_PAGES_EXPORT_LIMIT + 1);
}

async function readProjectPages(projectId: string, input: ProjectPagesListInput, limit?: number) {
  assertProjectPagesListInput(input);
  const project = await prisma.project.findFirst({
    select: { domain: true, id: true },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
  if (!project) throw new Error("Project not found.");
  const domain = trackedProjectDomain(project.domain);
  const host = domain ? canonicalProjectHost(domain) : null;
  if (!domain || !host) {
    return {
      sitemapFilterStatus: input.sitemapState ? ("sitemap_not_checked" as const) : ("ok" as const),
      sitemapChecked: false,
      conversions: disconnectedConversionSource,
      counts: emptyProjectPagesCounts,
      rows: [],
      total: 0,
    };
  }

  const [search, sessionsConnection, plausible, conversionSources, sitemapRead] = await Promise.all(
    [
      readSearchInsightsConnection(project.id),
      readOrganicSessionsConnection(project.id),
      prisma.providerConnection.findFirst({
        select: { id: true },
        where: {
          enabled: true,
          kind: "analytics",
          projectId: project.id,
          provider: "plausible",
          status: "connected",
        },
      }),
      getConversionSources(project.id),
      getStoredSitemapRead(project.id),
    ],
  );
  const conversions = resolveConversionSource({
    requested: input.conversionSource,
    sources: conversionSources,
  });
  const queryInput: ProjectPagesQueryInput = {
    conversionSource: conversions.selected,
    from: input.period.from,
    ga4Property: sessionsConnection.connection?.property ?? null,
    gscProperty: search.connection?.property ?? null,
    host,
    coverageState: input.coverageState,
    cwv: input.cwv,
    indexGroup: input.indexGroup,
    page: limit ? 1 : input.page,
    pageSize: limit ?? input.pageSize,
    projectId: project.id,
    search: input.search,
    sessions: sessionsConnection.connection ? "ga4" : plausible ? "plausible" : "none",
    sitemapState: input.sitemapState,
    sitemapRead,
    sort: input.sort,
    source: input.source,
    status: input.status,
    tagId: input.tagId,
    to: input.period.to,
  };
  const query = projectPagesListQuery(queryInput);
  const [counts, rows] = await Promise.all([
    prisma.$queryRaw<
      {
        all: number;
        sitemapChecked: boolean;
        sitemapComplete: boolean;
        inSnapshot: number;
        listed: number;
        newCount: number;
        notListed: number | null;
        removed: number;
        total: number;
      }[]
    >(query.counts),
    prisma.$queryRaw<ProjectPageListRecord[]>(query.rows),
  ]);
  const count = counts[0];
  const sitemapFilterStatus: ProjectPagesSitemapFilterStatus =
    input.sitemapState && !count?.sitemapChecked
      ? "sitemap_not_checked"
      : input.sitemapState === "not_listed" && !count?.sitemapComplete
        ? "sitemap_incomplete"
        : "ok";
  const matchingRows = sitemapFilterStatus === "ok" ? rows : [];
  const pageIds = matchingRows.flatMap((row) => (row.id ? [row.id] : []));
  const tagRows = pageIds.length
    ? await prisma.$queryRaw<{ name: string; pageId: string; tagId: string }[]>`
        SELECT page_tag."pageId" AS "pageId", tag."publicId" AS "tagId", tag.name AS name
        FROM "page_tags" page_tag
        JOIN "tags" tag ON tag.id = page_tag."tagId"
        WHERE page_tag."pageId" = ANY(${pageIds}::text[])
        ORDER BY tag.name ASC
      `
    : [];
  const tagsByPage = new Map<string, { id: string; name: string }[]>();
  for (const tag of tagRows) {
    if (!tag.pageId || !tag.tagId || !tag.name) continue;
    const list = tagsByPage.get(tag.pageId) ?? [];
    list.push({ id: tag.tagId, name: tag.name });
    tagsByPage.set(tag.pageId, list);
  }
  return {
    sitemapFilterStatus,
    sitemapComplete: count?.sitemapComplete === true,
    sitemapChecked: count?.sitemapChecked === true,
    sitemapReadAt: sitemapRead?.latestFetchedAt ?? sitemapRead?.fetchedAt ?? null,
    period: { from: input.period.from.toISOString(), to: input.period.to.toISOString() },
    conversions,
    counts: {
      all: Number(count?.all ?? 0),
      inSnapshot: Number(count?.inSnapshot ?? 0),
      listed: Number(count?.listed ?? 0),
      new: Number(count?.newCount ?? 0),
      notListed: count?.notListed == null ? null : Number(count.notListed),
      removed: Number(count?.removed ?? 0),
    },
    rows: matchingRows.map((row) => {
      const mapped = mapProjectPageRow(row, { domain, sessions: queryInput.sessions });
      return { ...mapped, tags: tagsByPage.get(mapped.pageId) ?? [] };
    }),
    total: sitemapFilterStatus === "ok" ? Number(count?.total ?? 0) : 0,
  };
}

export async function getProjectPageSources(projectId: string) {
  const project = await prisma.project.findFirst({
    select: { id: true, syncPauses: syncPauseSelection("sitemap_fetch") },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
  if (!project) throw new Error("Project not found.");
  const [search, sessions, connections, sitemapRead] = await Promise.all([
    readSearchInsightsConnection(project.id),
    readOrganicSessionsConnection(project.id),
    prisma.providerConnection.findMany({
      select: { enabled: true, kind: true, provider: true, status: true },
      where: { enabled: true, projectId: project.id, status: "connected" },
    }),
    getStoredSitemapRead(project.id),
  ]);
  const facts = await readColumnFacts(
    project.id,
    {
      ga4Property: sessions.connection?.property ?? null,
      gscProperty: search.connection?.property ?? null,
    },
    sitemapRead,
  );
  const serp = connections.some((connection) => connection.kind === "serp");
  return projectPageColumnSources(facts, {
    aiConnected: connections.some((connection) => connection.provider === AI_RESEARCH_PROVIDER_ID),
    ga4Connected: sessions.connection !== null,
    gscConnected: search.connection !== null,
    pagespeedConnected: connections.some((connection) => connection.provider === "pagespeed"),
    plausibleConnected: connections.some((connection) => connection.provider === "plausible"),
    rankConnected: serp || facts.keywords > 0,
    sitemapEnabled: project.syncPauses.length === 0,
    sitemapChecked: sitemapRead !== null && sitemapRead.checked !== false,
  });
}
