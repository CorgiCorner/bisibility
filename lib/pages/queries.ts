import "server-only";

import { AI_RESEARCH_PROVIDER_ID } from "@/lib/ai-research/catalog-types";
import { getConversionSources } from "@/lib/conversions/queries";
import { disconnectedConversionSource, resolveConversionSource } from "@/lib/conversions/selection";
import { prisma } from "@/lib/db/prisma";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { readSearchInsightsConnection } from "@/lib/search-insights/sync/credentials";
import { readOrganicSessionsConnection } from "@/lib/search-insights/sync/sessions-credentials";
import { type PageColumnFacts, projectPageColumnSources } from "./columns";
import { mapProjectPageRow, type ProjectPageListRecord } from "./list-row";
import { type ProjectPagesQueryInput, projectPagesListQuery } from "./list-sql";
import { canonicalProjectHost } from "./page-path";
import {
  assertProjectPagesListInput,
  emptyProjectPagesCounts,
  type ProjectPagesListInput,
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
): Promise<PageColumnFacts> {
  const [facts] = await prisma.$queryRaw<PageColumnFacts[]>`
    SELECT
      (SELECT COUNT(*)::int FROM "project_page_sources" source
        JOIN "project_pages" page ON page.id = source."pageId"
        WHERE page."projectId" = ${projectId} AND source.source = 'sitemap'
          AND source.detail->>'listed' = 'true') AS listed,
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
      conversions: disconnectedConversionSource,
      counts: emptyProjectPagesCounts,
      rows: [],
      total: 0,
    };
  }

  const [search, sessionsConnection, plausible, conversionSources] = await Promise.all([
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
  ]);
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
    page: input.page,
    pageSize: input.pageSize,
    projectId: project.id,
    search: input.search,
    sessions: sessionsConnection.connection ? "ga4" : plausible ? "plausible" : "none",
    sitemapState: input.sitemapState,
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
        inSnapshot: number;
        listed: number;
        newCount: number;
        notListed: number;
        removed: number;
        total: number;
      }[]
    >(query.counts),
    prisma.$queryRaw<ProjectPageListRecord[]>(query.rows),
  ]);
  const count = counts[0];
  const pageIds = rows.flatMap((row) => (row.id ? [row.id] : []));
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
    conversions,
    counts: {
      all: Number(count?.all ?? 0),
      inSnapshot: Number(count?.inSnapshot ?? 0),
      listed: Number(count?.listed ?? 0),
      new: Number(count?.newCount ?? 0),
      notListed: Number(count?.notListed ?? 0),
      removed: Number(count?.removed ?? 0),
    },
    rows: rows.map((row) => {
      const mapped = mapProjectPageRow(row, { domain, sessions: queryInput.sessions });
      return { ...mapped, tags: tagsByPage.get(mapped.pageId) ?? [] };
    }),
    total: Number(count?.total ?? 0),
  };
}

export async function getProjectPageSources(projectId: string) {
  const project = await prisma.project.findFirst({
    select: { id: true, sitemapMonitoringEnabled: true },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
  if (!project) throw new Error("Project not found.");
  const [search, sessions, connections] = await Promise.all([
    readSearchInsightsConnection(project.id),
    readOrganicSessionsConnection(project.id),
    prisma.providerConnection.findMany({
      select: { enabled: true, kind: true, provider: true, status: true },
      where: { enabled: true, projectId: project.id, status: "connected" },
    }),
  ]);
  const facts = await readColumnFacts(project.id, {
    ga4Property: sessions.connection?.property ?? null,
    gscProperty: search.connection?.property ?? null,
  });
  const serp = connections.some((connection) => connection.kind === "serp");
  return projectPageColumnSources(facts, {
    aiConnected: connections.some((connection) => connection.provider === AI_RESEARCH_PROVIDER_ID),
    ga4Connected: sessions.connection !== null,
    gscConnected: search.connection !== null,
    pagespeedConnected: connections.some((connection) => connection.provider === "pagespeed"),
    plausibleConnected: connections.some((connection) => connection.provider === "plausible"),
    rankConnected: serp || facts.keywords > 0,
    sitemapEnabled: project.sitemapMonitoringEnabled,
  });
}
