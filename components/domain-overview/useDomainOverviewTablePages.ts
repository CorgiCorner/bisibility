"use client";

import { unresolvedPayment } from "@/components/action-payment/unresolved-payment";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import type {
  LoadDomainKeywordsPageAction,
  LoadDomainPagesPageAction,
} from "@/lib/actions/domain-overview";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import type { ResearchScope } from "@/lib/research/scope";
import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import { appendKeywords, appendPages, providerConsumedCount } from "./domain-overview-append";
import {
  type DomainOverviewEstimateView,
  type DomainOverviewUiOutcome,
  domainOverviewReportIdentity,
} from "./domain-overview-workspace-model";
import { domainPagePaymentInput } from "./domain-payment-inputs";

type TableModule = "keywords" | "pages";
type ModulePaging = { hasMore: boolean; nextOffset: number };
type TablePaging = {
  identity: string;
  keywords: ModulePaging;
  pages: ModulePaging;
};
type ActiveRequest = { id: number; identity: string; module: TableModule };

const PAGE_LIMIT = 100;

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

export function useDomainOverviewTablePages({
  activeResearchScope,
  addSpend,
  loadKeywordsPageAction,
  loadPagesPageAction,
  projectId,
  report,
  setOutcome,
}: Readonly<{
  activeResearchScope: (ResearchScope & { providerLocationCode: number }) | null;
  addSpend: (costCents: number) => void;
  estimate: DomainOverviewEstimateView;
  loadKeywordsPageAction: (
    input: unknown,
  ) => Promise<Awaited<ReturnType<LoadDomainKeywordsPageAction>> | null>;
  loadPagesPageAction: (
    input: unknown,
  ) => Promise<Awaited<ReturnType<LoadDomainPagesPageAction>> | null>;
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
  const [payments, setPayments] = useState<{
    identity: string;
    values: Partial<Record<TableModule, ActionPaymentReceipt>>;
  }>();
  const [blocked, setBlocked] = useState<{ identity: string; modules: TableModule[] }>();
  const [error, setError] = useState<{ identity: string; module: TableModule } | null>(null);
  const [paging, setPaging] = useState<TablePaging>(() => initialPaging(report, identity));
  const currentPaging = paging.identity === identity ? paging : initialPaging(report, identity);

  async function loadMore(module: TableModule) {
    if (!activeResearchScope || !report || activeRequest.current?.identity === identity) return;
    const current = module === "keywords" ? report.keywords : report.pages;
    const modulePaging = currentPaging[module];
    const canLoad = current.ok ? modulePaging.hasMore : modulePaging.nextOffset === 0;
    if (!canLoad || (blocked?.identity === identity && blocked.modules.includes(module))) return;
    const request: ActiveRequest = { id: ++requestId.current, identity, module };
    const input = domainPagePaymentInput(projectId, report, modulePaging.nextOffset);
    activeRequest.current = request;
    setLoading(request);
    setError(null);
    try {
      if (module === "keywords") {
        const result = await loadKeywordsPageAction(input);
        if (!result) return;
        if ("estimate" in result) {
          setError({ identity, module });
          return;
        }
        addSpend(result.costCents);
        if (latestIdentity.current !== identity) return;
        if ("payment" in result)
          setPayments((value) => ({
            identity,
            values: {
              ...(value?.identity === identity ? value.values : {}),
              [module]: result.payment,
            },
          }));
        if (unresolvedPayment(result))
          setBlocked((value) => ({
            identity,
            modules: [...new Set([...(value?.identity === identity ? value.modules : []), module])],
          }));
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
        if (!result) return;
        if ("estimate" in result) {
          setError({ identity, module });
          return;
        }
        addSpend(result.costCents);
        if (latestIdentity.current !== identity) return;
        if ("payment" in result)
          setPayments((value) => ({
            identity,
            values: {
              ...(value?.identity === identity ? value.values : {}),
              [module]: result.payment,
            },
          }));
        if (unresolvedPayment(result))
          setBlocked((value) => ({
            identity,
            modules: [...new Set([...(value?.identity === identity ? value.modules : []), module])],
          }));
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
      if (latestIdentity.current === identity) {
        setBlocked((value) => ({
          identity,
          modules: [...new Set([...(value?.identity === identity ? value.modules : []), module])],
        }));
        setError({ identity, module });
      }
    } finally {
      if (activeRequest.current?.id === request.id) activeRequest.current = null;
      setLoading((value) => (value?.id === request.id ? null : value));
    }
  }

  return {
    tableBlocked: blocked?.identity === identity ? blocked.modules : [],
    tablePayments: payments?.identity === identity ? payments.values : undefined,
    tableQuoteInputs: report
      ? {
          keywords: domainPagePaymentInput(projectId, report, currentPaging.keywords.nextOffset),
          pages: domainPagePaymentInput(projectId, report, currentPaging.pages.nextOffset),
        }
      : null,
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
