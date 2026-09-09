"use server";

import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import { getKeywordDefaultMarket } from "@/lib/queries/keywords";
import { getProjectMarkets, type ProjectMarketsView } from "@/lib/queries/project-markets";
import { DRAWER_LIST_CAP } from "@/lib/search-insights/constants";
import {
  loadPositionBandQueries,
  type SearchInsightsBandRow,
} from "@/lib/search-insights/queries/band-list";
import type { SearchInsightsList } from "@/lib/search-insights/queries/detail-model";
import {
  loadOverlapQueries,
  type SearchInsightsOverlapRow,
} from "@/lib/search-insights/queries/overlap-list";
import {
  loadPageDetail,
  type SearchInsightsPageDetail,
} from "@/lib/search-insights/queries/page-detail";
import {
  loadQueryDetail,
  type SearchInsightsQueryDetail,
} from "@/lib/search-insights/queries/query-detail";
import type { SerpDevice } from "@/lib/serp/constants";
import { z } from "zod";
import { parseActionInput } from "./_shared";

// Provider dimension values are long; these bounds keep a request from carrying anything the
// stored rows could not hold in the first place.
const QUERY_TEXT_MAX = 1_000;
const PAGE_URL_MAX = 2_048;

const scopeSchema = {
  comparison: z.string().trim().max(20).optional(),
  period: z.string().trim().max(8).optional(),
  projectId: z.string().trim().min(1).max(120),
  property: z.string().trim().min(1).max(300),
};

const queryDetailSchema = z.object({
  ...scopeSchema,
  query: z.string().min(1).max(QUERY_TEXT_MAX),
});

const pageDetailSchema = z.object({
  ...scopeSchema,
  page: z.string().min(1).max(PAGE_URL_MAX),
});

const listSchema = z.object({
  ...scopeSchema,
  limit: z.number().int().min(1).max(DRAWER_LIST_CAP).optional(),
});

const trackDialogSchema = z.object({ projectId: scopeSchema.projectId });

export type SearchInsightsTrackDialogPayload = {
  costContext: ProjectCostContext;
  defaultDevice: SerpDevice;
  defaultMarketKey: string | null;
  projectMarkets: ProjectMarketsView;
};

export async function loadSearchInsightsTrackDialog(
  input: unknown,
): Promise<SearchInsightsTrackDialogPayload> {
  const { projectId } = parseActionInput(trackDialogSchema, input);
  const [projectMarkets, defaultMarket, costContext] = await Promise.all([
    getProjectMarkets(projectId),
    getKeywordDefaultMarket(projectId),
    getProjectCostContext(projectId),
  ]);
  return {
    costContext,
    defaultDevice: defaultMarket.device,
    defaultMarketKey: defaultMarket.locationKey,
    projectMarkets,
  };
}

/**
 * The four drawer reads. Every one of them touches the stored daily tables only: opening a
 * drawer costs nothing at the provider, which is what makes the retention promise on the trust
 * strip usable rather than merely stated. The read services authorize the project reference and
 * resolve the property and window themselves, so nothing about what is readable comes from here.
 */
export async function loadSearchInsightsQueryDetail(
  input: unknown,
): Promise<SearchInsightsQueryDetail> {
  const data = parseActionInput(queryDetailSchema, input);
  return loadQueryDetail(data.projectId, {
    ...(data.comparison ? { comparison: data.comparison } : {}),
    period: data.period,
    property: data.property,
    query: data.query,
  });
}

export async function loadSearchInsightsPageDetail(
  input: unknown,
): Promise<SearchInsightsPageDetail> {
  const data = parseActionInput(pageDetailSchema, input);
  return loadPageDetail(data.projectId, {
    ...(data.comparison ? { comparison: data.comparison } : {}),
    page: data.page,
    period: data.period,
    property: data.property,
  });
}

export async function loadSearchInsightsBandList(
  input: unknown,
): Promise<SearchInsightsList<SearchInsightsBandRow>> {
  const data = parseActionInput(listSchema, input);
  return loadPositionBandQueries(data.projectId, {
    ...(data.comparison ? { comparison: data.comparison } : {}),
    limit: data.limit,
    period: data.period,
    property: data.property,
  });
}

export async function loadSearchInsightsOverlapList(
  input: unknown,
): Promise<SearchInsightsList<SearchInsightsOverlapRow>> {
  const data = parseActionInput(listSchema, input);
  return loadOverlapQueries(data.projectId, {
    ...(data.comparison ? { comparison: data.comparison } : {}),
    limit: data.limit,
    period: data.period,
    property: data.property,
  });
}

export type LoadSearchInsightsQueryDetailAction = typeof loadSearchInsightsQueryDetail;
export type LoadSearchInsightsPageDetailAction = typeof loadSearchInsightsPageDetail;
export type LoadSearchInsightsBandListAction = typeof loadSearchInsightsBandList;
export type LoadSearchInsightsOverlapListAction = typeof loadSearchInsightsOverlapList;
export type LoadSearchInsightsTrackDialogAction = typeof loadSearchInsightsTrackDialog;
