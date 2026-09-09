import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  type FeedFacet,
  type FeedFacetOptions,
  type FeedRowMetadata,
  feedFacetValues,
  parseFeedFacets,
} from "@/lib/feeds/facets";
import type { Prisma, SignalSeverity, SignalSource } from "@/lib/generated/prisma/client";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import { requireReadableProject } from "./_auth";
import { getRequestProjectDefaults } from "./workspace-request-data";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type TimelineFilterKey = "all" | "deploys" | "notes" | "pages" | "rankings";
export type TimelineSignalRow = Prisma.SignalGetPayload<{
  include: {
    createdBy: { select: { email: true; name: true } };
    keyword: {
      select: {
        device: true;
        locationId: true;
        locationRef: { select: { displayName: true; languageLabel: true } };
        publicId: true;
        text: true;
      };
    };
  };
}> & { feedMeta?: FeedRowMetadata };
export type TimelineView = {
  filter: TimelineFilterKey;
  facetOptions?: FeedFacetOptions;
  facets?: FeedFacet[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFiltered: boolean;
  now: Date;
  page: number;
  rows: TimelineSignalRow[];
  search: string;
  timeZone: string;
};
export type TimelineQueryInput = {
  filter?: string | string[];
  f?: string | string[];
  now?: Date;
  page?: number | string | string[];
  pageSize?: number;
  q?: string | string[];
  search?: string | string[];
};

const filterKeys = ["all", "rankings", "pages", "deploys", "notes"] satisfies TimelineFilterKey[];
const pageSignalTypes = [
  SIGNAL_TYPES.sitemapChanged,
  SIGNAL_TYPES.pageChanged,
  SIGNAL_TYPES.urlIndexed,
  SIGNAL_TYPES.urlDeindexed,
];
const sourcesByModule: Record<string, SignalSource[]> = {
  deploy: ["api", "cms", "deploy"],
  notes: ["manual"],
  pages: ["sitemap", "url_inspection"],
  rank: ["rank_tracker", "search_analytics"],
  status: ["search_engine_status"],
};

type FeedMarket = { id: string; label: string; language: string; locationId: string };

function timelineFacetOptions(markets: readonly FeedMarket[]): FeedFacetOptions {
  return {
    engine: [{ label: "Google", value: "google" }],
    language: Array.from(new Set(markets.map((market) => market.language))).map((language) => ({
      label: language,
      value: language,
    })),
    market: markets.map(({ id, label }) => ({ label, value: id })),
    module: Object.keys(sourcesByModule).map((module) => ({
      label: module[0].toUpperCase() + module.slice(1),
      value: module,
    })),
    severity: ["critical", "warning", "info"].map((severity) => ({
      label: severity[0].toUpperCase() + severity.slice(1),
      value: severity,
    })),
  };
}

function timelineFacetWhere(facets: readonly FeedFacet[], markets: readonly FeedMarket[]) {
  const marketLocationIds = new Map(markets.map((market) => [market.id, market.locationId]));
  const languageLabels = new Map(
    markets.map((market) => [market.language.toLowerCase(), market.language]),
  );
  const where: Prisma.SignalWhereInput[] = [];
  const modules = feedFacetValues(facets, "module");
  const marketIds = feedFacetValues(facets, "market");
  const languages = feedFacetValues(facets, "language");
  const engines = feedFacetValues(facets, "engine");
  const severity = feedFacetValues(facets, "severity");

  if (modules.length)
    where.push({ source: { in: modules.flatMap((module) => sourcesByModule[module] ?? []) } });
  if (marketIds.length) {
    where.push({
      keyword: { locationId: { in: marketIds.flatMap((id) => marketLocationIds.get(id) ?? []) } },
    });
  }
  if (languages.length) {
    where.push({
      keyword: {
        locationRef: {
          languageLabel: {
            in: languages.flatMap((language) => languageLabels.get(language) ?? []),
          },
        },
      },
    });
  }
  if (engines.length) where.push({ source: { in: ["rank_tracker"] } });
  if (severity.length) where.push({ severity: { in: severity as SignalSeverity[] } });
  return where;
}

function firstValue(value: number | string | string[] | undefined) {
  if (typeof value === "number") return String(value);
  return Array.isArray(value) ? value[0] : value;
}

function normalize(input: TimelineQueryInput) {
  const rawFilter = firstValue(input.filter);
  const page = Number(firstValue(input.page));
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const filter = filterKeys.includes(rawFilter as TimelineFilterKey)
    ? (rawFilter as TimelineFilterKey)
    : "all";

  return {
    filter,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize)
      ? Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
    search: (firstValue(input.search) ?? firstValue(input.q) ?? "").trim().slice(0, 80),
  };
}

function andWhere(...parts: (Prisma.SignalWhereInput | undefined)[]): Prisma.SignalWhereInput {
  const active = parts.filter(Boolean) as Prisma.SignalWhereInput[];
  return active.length === 1 ? active[0] : { AND: active };
}

function searchWhere(search: string): Prisma.SignalWhereInput | undefined {
  if (!search) return undefined;
  const contains = { contains: search, mode: "insensitive" as const };

  return {
    OR: [
      { publicId: contains },
      { type: contains },
      { url: contains },
      {
        payload: {
          mode: "insensitive",
          path: ["note"],
          string_contains: search,
        },
      },
    ],
  };
}

function filterWhere(filter: TimelineFilterKey): Prisma.SignalWhereInput | undefined {
  if (filter === "rankings") return { source: "rank_tracker" };
  if (filter === "pages") {
    return {
      OR: [{ type: { in: pageSignalTypes } }, { source: { in: ["sitemap", "url_inspection"] } }],
    };
  }
  if (filter === "deploys") return { source: { in: ["deploy", "cms", "api"] } };
  if (filter === "notes") return { type: SIGNAL_TYPES.note };
  return undefined;
}

function moduleForSource(source: SignalSource) {
  return Object.entries(sourcesByModule).find(([, sources]) => sources.includes(source))?.[0];
}

function feedMetaFor(
  row: TimelineSignalRow,
  markets: ReadonlyMap<string, FeedMarket>,
): FeedRowMetadata {
  const market = row.keyword ? markets.get(row.keyword.locationId) : undefined;
  return {
    ...(row.keyword?.locationRef.languageLabel
      ? { language: row.keyword.locationRef.languageLabel }
      : {}),
    ...(market ? { market: { id: market.id, label: market.label } } : {}),
    ...(moduleForSource(row.source) ? { module: moduleForSource(row.source) } : {}),
    ...(row.source === "rank_tracker" ? { engine: "Google" } : {}),
    severity: row.severity,
  };
}

export async function getTimelineView(
  projectId: string,
  input: TimelineQueryInput = {},
): Promise<TimelineView> {
  const { project } = await requireReadableProject(projectId);
  const now = input.now ?? new Date();
  const { filter, page, pageSize, search } = normalize(input);
  const [defaults, marketRows] = await Promise.all([
    getRequestProjectDefaults(project.id),
    prisma.projectMarket.findMany({
      select: {
        location: { select: { displayName: true, languageLabel: true } },
        locationId: true,
        publicId: true,
      },
      where: { projectId: project.id, status: "active" },
    }),
  ]);
  const markets = marketRows.map((market) => ({
    id: market.publicId,
    label: `${market.location.displayName} / ${market.location.languageLabel}`,
    language: market.location.languageLabel,
    locationId: market.locationId,
  }));
  const facetOptions = timelineFacetOptions(markets);
  const { facets } = parseFeedFacets({ f: input.f }, facetOptions);
  const rows = await prisma.signal.findMany({
    include: {
      createdBy: { select: { email: true, name: true } },
      keyword: {
        select: {
          device: true,
          locationId: true,
          locationRef: { select: { displayName: true, languageLabel: true } },
          publicId: true,
          text: true,
        },
      },
    },
    orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    where: andWhere(
      { projectId: project.id },
      searchWhere(search),
      filterWhere(filter),
      ...timelineFacetWhere(facets, markets),
    ),
  });
  const marketsByLocation = new Map(markets.map((market) => [market.locationId, market]));

  return {
    facetOptions,
    facets,
    filter,
    hasNextPage: rows.length > pageSize,
    hasPreviousPage: page > 1,
    isFiltered: Boolean(search) || filter !== "all" || facets.length > 0,
    now,
    page,
    rows: rows
      .slice(0, pageSize)
      .map((row) => ({ ...row, feedMeta: feedMetaFor(row, marketsByLocation) })),
    search,
    timeZone: defaults?.timezone ?? "UTC",
  };
}
