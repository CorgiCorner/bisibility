import type { RankedKeywordsPage, RelevantPagesResult } from "@/lib/providers/types";
import { domainOverviewCacheKey, domainOverviewFailure, loadDomainOverviewModule } from "./cache";
import { requireDomainOverviewSource } from "./context";
import {
  assertDomainOverviewMaxCost,
  domainOverviewEstimate,
  fetchDomainKeywords,
  fetchDomainPages,
} from "./provider-call";
import {
  domainOverviewPageLimit,
  normalizeDomainOverviewMarket,
  normalizeDomainOverviewTarget,
} from "./target";
import type {
  DomainModuleOutcome,
  DomainOverviewServiceContext,
  LoadDomainModuleOptions,
} from "./types";

type DomainPageData = { keywords: RankedKeywordsPage; pages: RelevantPagesResult };
type DomainPageArguments = [DomainOverviewServiceContext, LoadDomainModuleOptions];

async function loadDomainPage<T extends "keywords" | "pages">(
  context: DomainOverviewServiceContext,
  options: LoadDomainModuleOptions,
  module: T,
): Promise<DomainModuleOutcome<DomainPageData[T]>> {
  try {
    const input = {
      ...normalizeDomainOverviewMarket(options),
      ...normalizeDomainOverviewTarget(options.target, options.scopeOverride),
      limit: domainOverviewPageLimit(options.limit, 1_000),
      offset: Math.max(0, Math.trunc(options.offset)),
    };
    const { project, source } = await requireDomainOverviewSource(context.projectId);
    const estimate = domainOverviewEstimate({
      keywordLimit: input.limit,
      pageLimit: input.limit,
      source,
    })[module];
    const common = {
      ...input,
      budgetCapCents: project.budgetCapCents,
      projectId: project.id,
      source,
    };
    const load = async () => {
      const data =
        module === "keywords" ? await fetchDomainKeywords(common) : await fetchDomainPages(common);
      return { costCents: data.costCents, data };
    };
    return (await loadDomainOverviewModule({
      beforeLoad: () => assertDomainOverviewMaxCost(estimate, options.maxCostCents),
      fresh: options.fresh,
      key: domainOverviewCacheKey({
        ...input,
        module,
        projectId: project.id,
        provider: source.provider.id,
      }),
      load,
    })) as DomainModuleOutcome<DomainPageData[T]>;
  } catch (error) {
    return domainOverviewFailure(error);
  }
}

export const loadDomainKeywordsPage = (...args: DomainPageArguments) =>
  loadDomainPage(...args, "keywords");
export const loadDomainPagesPage = (...args: DomainPageArguments) =>
  loadDomainPage(...args, "pages");
