"use client";

import type {
  LoadDomainKeywordsPageAction,
  LoadDomainPagesPageAction,
} from "@/lib/actions/domain-overview";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import {
  type DomainOverviewEstimateView,
  type DomainOverviewMarketView,
  type DomainOverviewUiOutcome,
  domainOverviewReportIdentity,
  reportFrom,
} from "./domain-overview-workspace-model";

type TableModule = "keywords" | "pages";
type ModulePaging = { hasMore: boolean; nextOffset: number };
type TablePaging = {
  identity: string;
  keywords: ModulePaging;
  pages: ModulePaging;
};
type ActiveRequest = { id: number; identity: string; module: TableModule };

const PAGE_LIMIT = 100;

function providerConsumedCount(page: { consumedCount?: number; rows: unknown[] }) {
  const consumedCount = page.consumedCount;
  return typeof consumedCount === "number" &&
    Number.isSafeInteger(consumedCount) &&
    consumedCount >= 0
    ? consumedCount
    : page.rows.length;
}

type TablePageInput = {
  fresh: false;
  languageCode: string;
  limit: number;
  locationCode: number;
  maxCostCents: number;
  offset: number;
  projectId: string;
  scopeOverride: DomainOverviewReport["scope"];
  target: string;
};

function initialModulePaging(
  module: DomainOverviewReport["keywords"] | DomainOverviewReport["pages"],
): ModulePaging {
  if (!module.ok) return { hasMore: false, nextOffset: 0 };
  const nextOffset = providerConsumedCount(module.data);
  return {
    hasMore:
      module.data.totalCount == null
        ? nextOffset >= PAGE_LIMIT
        : nextOffset < module.data.totalCount,
    nextOffset,
  };
}

function initialPaging(report: DomainOverviewReport | null, identity: string): TablePaging {
  return {
    identity,
    keywords: report ? initialModulePaging(report.keywords) : { hasMore: false, nextOffset: 0 },
    pages: report ? initialModulePaging(report.pages) : { hasMore: false, nextOffset: 0 },
  };
}

function nextModulePaging(
  current: ModulePaging,
  consumedCount: number,
  totalCount: number | null,
): ModulePaging {
  const nextOffset = current.nextOffset + consumedCount;
  return {
    hasMore: consumedCount === PAGE_LIMIT && (totalCount == null || nextOffset < totalCount),
    nextOffset,
  };
}

function appendKeywords(
  setOutcome: Dispatch<SetStateAction<DomainOverviewUiOutcome | null>>,
  result: Awaited<ReturnType<LoadDomainKeywordsPageAction>> & { ok: true },
  expectedIdentity: string,
) {
  setOutcome((current) => {
    const report = reportFrom(current);
    if (!report?.keywords.ok || domainOverviewReportIdentity(report) !== expectedIdentity) {
      return current;
    }
    const rows = new Map(
      report.keywords.data.rows.map((row) => [`${row.keyword}:${row.rankingUrl ?? ""}`, row]),
    );
    for (const row of result.data.rows) rows.set(`${row.keyword}:${row.rankingUrl ?? ""}`, row);
    return {
      ...report,
      cached: report.cached && result.cached,
      costCents: report.costCents + result.costCents,
      keywords: {
        ...result,
        data: {
          ...result.data,
          consumedCount:
            providerConsumedCount(report.keywords.data) + providerConsumedCount(result.data),
          rows: [...rows.values()],
        },
      },
    };
  });
}

function appendPages(
  setOutcome: Dispatch<SetStateAction<DomainOverviewUiOutcome | null>>,
  result: Awaited<ReturnType<LoadDomainPagesPageAction>> & { ok: true },
  expectedIdentity: string,
) {
  setOutcome((current) => {
    const report = reportFrom(current);
    if (!report?.pages.ok || domainOverviewReportIdentity(report) !== expectedIdentity)
      return current;
    const rows = new Map(report.pages.data.rows.map((row) => [row.path, row]));
    for (const row of result.data.rows) rows.set(row.path, row);
    return {
      ...report,
      cached: report.cached && result.cached,
      costCents: report.costCents + result.costCents,
      pages: {
        ...result,
        data: {
          ...result.data,
          consumedCount:
            providerConsumedCount(report.pages.data) + providerConsumedCount(result.data),
          rows: [...rows.values()],
        },
      },
    };
  });
}

export function useDomainOverviewTablePages({
  activeMarket,
  addSpend,
  estimate,
  loadKeywordsPageAction,
  loadPagesPageAction,
  projectId,
  report,
  setOutcome,
}: Readonly<{
  activeMarket: DomainOverviewMarketView | null;
  addSpend: (costCents: number) => void;
  estimate: DomainOverviewEstimateView;
  loadKeywordsPageAction: LoadDomainKeywordsPageAction;
  loadPagesPageAction: LoadDomainPagesPageAction;
  projectId: string;
  report: DomainOverviewReport | null;
  setOutcome: Dispatch<SetStateAction<DomainOverviewUiOutcome | null>>;
}>) {
  const identity = domainOverviewReportIdentity(report);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  const activeRequest = useRef<ActiveRequest | null>(null);
  const requestId = useRef(0);
  const [loading, setLoading] = useState<ActiveRequest | null>(null);
  const [error, setError] = useState<{ identity: string; module: TableModule } | null>(null);
  const [paging, setPaging] = useState<TablePaging>(() => initialPaging(report, identity));
  const currentPaging = paging.identity === identity ? paging : initialPaging(report, identity);

  async function loadMore(module: TableModule) {
    if (!activeMarket || !report || activeRequest.current?.identity === identity) return;
    const current = module === "keywords" ? report.keywords : report.pages;
    const modulePaging = currentPaging[module];
    if (!current.ok || !modulePaging.hasMore) return;
    const estimateCents =
      module === "keywords" ? estimate.keywordPageCostCents : estimate.pagePageCostCents;
    if (estimateCents == null) return;
    const request: ActiveRequest = { id: ++requestId.current, identity, module };
    const input: TablePageInput = {
      fresh: false,
      languageCode: report.languageCode,
      limit: PAGE_LIMIT,
      locationCode: report.locationCode,
      maxCostCents: Math.ceil(estimateCents),
      offset: modulePaging.nextOffset,
      projectId,
      scopeOverride: report.scope,
      target: report.target,
    };
    activeRequest.current = request;
    setLoading(request);
    setError(null);
    try {
      if (module === "keywords") {
        const result = await loadKeywordsPageAction(input);
        addSpend(result.costCents);
        if (latestIdentity.current !== identity) return;
        if (result.ok) {
          appendKeywords(setOutcome, result, identity);
          const next = nextModulePaging(
            modulePaging,
            providerConsumedCount(result.data),
            result.data.totalCount,
          );
          setPaging((value) =>
            latestIdentity.current === identity
              ? {
                  ...(value.identity === identity ? value : currentPaging),
                  identity,
                  keywords: next,
                }
              : value,
          );
        } else {
          setError({ identity, module });
        }
      } else {
        const result = await loadPagesPageAction(input);
        addSpend(result.costCents);
        if (latestIdentity.current !== identity) return;
        if (result.ok) {
          appendPages(setOutcome, result, identity);
          const next = nextModulePaging(
            modulePaging,
            providerConsumedCount(result.data),
            result.data.totalCount,
          );
          setPaging((value) =>
            latestIdentity.current === identity
              ? {
                  ...(value.identity === identity ? value : currentPaging),
                  identity,
                  pages: next,
                }
              : value,
          );
        } else {
          setError({ identity, module });
        }
      }
    } catch {
      if (latestIdentity.current === identity) setError({ identity, module });
    } finally {
      if (activeRequest.current?.id === request.id) activeRequest.current = null;
      setLoading((value) => (value?.id === request.id ? null : value));
    }
  }

  return {
    loadMore,
    loadingTable: loading?.identity === identity ? loading.module : null,
    resetTableError: () => setError(null),
    tableError: error?.identity === identity ? error.module : null,
    tableFetchedCount: {
      keywords: currentPaging.keywords.nextOffset,
      pages: currentPaging.pages.nextOffset,
    },
    tableHasMore: {
      keywords: currentPaging.keywords.hasMore,
      pages: currentPaging.pages.hasMore,
    },
  };
}
