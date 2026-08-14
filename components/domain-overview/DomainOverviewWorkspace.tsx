"use client";

import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import type { DomainOverviewMarketOption } from "@/lib/domain-overview/market-options";
import type { DomainOverviewScope, DomainRecentTarget } from "@/lib/domain-overview/types";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DomainOverviewAnalyzeCard } from "./DomainOverviewAnalyzeCard";
import { DomainOverviewResultsLoading } from "./DomainOverviewLoadingSkeletons";
import { DomainOverviewRecentTargets } from "./DomainOverviewRecentTargets";
import { DomainOverviewResults } from "./DomainOverviewResults";
import { DomainOverviewStatePanel } from "./DomainOverviewStatePanel";
import {
  type DomainOverviewUiOutcome,
  type DomainOverviewWorkspaceProps,
  detectedDomainScope,
  estimateInput,
  failureCharge,
  failureResetAt,
  failureState,
  reportFrom,
  reportUrl,
  supportedMarket,
} from "./domain-overview-workspace-model";
import { useDomainOverviewEstimate } from "./useDomainOverviewEstimate";
import { useDomainOverviewHistory } from "./useDomainOverviewHistory";
import { useDomainOverviewTablePages } from "./useDomainOverviewTablePages";

export function DomainOverviewWorkspace({
  analyzeAction,
  context,
  initialEstimate,
  initialOutcome,
  initialScope,
  initialTarget = "",
  loadHistoryAction,
  loadKeywordsPageAction,
  loadPagesPageAction,
  market,
  projectId,
  projectRef,
  selectMarketAction,
  saveSelectedKeywordsAction,
}: Readonly<DomainOverviewWorkspaceProps>) {
  const router = useRouter();
  const { addSpend } = useSessionSpend();
  const activeMarket = supportedMarket(market);
  const [target, setTarget] = useState(initialTarget);
  const [scopeOverride, setScopeOverride] = useState<DomainOverviewScope | undefined>(
    detectedDomainScope(initialTarget) === "root" ? undefined : initialScope,
  );
  const [outcome, setOutcome] = useState<DomainOverviewUiOutcome | null>(initialOutcome);
  const [submitting, setSubmitting] = useState(false);
  const report = reportFrom(outcome);
  const requestInput = (nextTarget: string, nextScope = scopeOverride) =>
    activeMarket
      ? estimateInput({
          market: activeMarket,
          projectId,
          scopeOverride: nextScope,
          target: nextTarget,
        })
      : { estimateOnly: true, projectId, target: nextTarget };
  const { estimate, scheduleEstimate } = useDomainOverviewEstimate(
    analyzeAction,
    requestInput,
    initialEstimate,
  );
  const { loadMore, loadingTable, tableError, tableFetchedCount, tableHasMore } =
    useDomainOverviewTablePages({
      activeMarket,
      addSpend,
      estimate,
      loadKeywordsPageAction,
      loadPagesPageAction,
      projectId,
      report,
      setOutcome,
    });
  const { history, historyError, historyLoading, loadHistory, resetHistory } =
    useDomainOverviewHistory({
      activeMarket,
      addSpend,
      estimate,
      loadHistoryAction,
      projectId,
      report,
    });
  const recentTargets = context.recentTargets.filter(
    (recent) =>
      activeMarket &&
      recent.locationCode === activeMarket.locationCode &&
      recent.languageCode === activeMarket.languageCode,
  );

  function updateTarget(nextTarget: string) {
    const nextScope = detectedDomainScope(nextTarget) === "root" ? undefined : scopeOverride;
    setTarget(nextTarget);
    if (nextScope !== scopeOverride) setScopeOverride(nextScope);
    if (activeMarket) scheduleEstimate(nextTarget, nextScope);
  }

  async function changeMarket(next: DomainOverviewMarketOption) {
    if (next.canonicalKey === market?.canonicalKey) return;
    setSubmitting(true);
    try {
      const selected = await selectMarketAction({
        canonicalKey: next.canonicalKey,
        projectId,
      });
      if (selected.canonicalKey === market?.canonicalKey) {
        setSubmitting(false);
        return;
      }
      const params = new URLSearchParams({ market: selected.canonicalKey });
      if (target.trim()) params.set("domain", target.trim());
      if (scopeOverride) params.set("scope", scopeOverride);
      router.push(`${appPath(projectRef, "domain-overview")}?${params.toString()}`);
    } catch {
      setOutcome((current) =>
        reportFrom(current) ? current : { charged: null, ok: false, reason: "lookup_failed" },
      );
      setSubmitting(false);
    }
  }

  async function analyze(
    nextTarget = target,
    fresh = false,
    maxCostCents = Math.ceil(estimate.costCents ?? 0),
    nextScope = scopeOverride,
  ) {
    if (!activeMarket) return;
    setSubmitting(true);
    resetHistory();
    try {
      const result = await analyzeAction({
        estimateOnly: false,
        fresh,
        languageCode: activeMarket.languageCode,
        locationCode: activeMarket.locationCode,
        maxCostCents,
        projectId,
        scopeOverride: nextScope,
        target: nextTarget,
      });
      addSpend("costCents" in result ? result.costCents : 0);
      setOutcome((current) => (result.ok || !reportFrom(current) ? result : current));
      if (!result.ok && result.reason === "cost_limit_exceeded") {
        scheduleEstimate(nextTarget, nextScope);
      }
      if (result.ok && !("estimate" in result)) {
        setTarget(result.target);
        setScopeOverride(result.scope === "root" ? undefined : result.scope);
        window.history.replaceState(
          null,
          "",
          reportUrl({
            market: activeMarket,
            projectRef,
            scope: result.scope,
            target: result.target,
          }),
        );
      }
    } catch {
      setOutcome((current) =>
        reportFrom(current) ? current : { charged: null, ok: false, reason: "lookup_failed" },
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openRecent(recent: DomainRecentTarget) {
    if (!activeMarket) return;
    setSubmitting(true);
    router.push(
      reportUrl({ market: activeMarket, projectRef, scope: recent.scope, target: recent.target }),
    );
  }

  const blockedState =
    context.providerStatus === "no_provider"
      ? "no_provider"
      : context.providerStatus === "needs_reauth"
        ? "needs_reauth"
        : !market || !activeMarket
          ? "unsupported_location"
          : failureState(outcome);

  return (
    <section aria-label="Domain Overview" className="grid min-w-0 gap-4">
      {market ? (
        <DomainOverviewAnalyzeCard
          catalogMarkets={context.catalogMarkets}
          estimate={estimate}
          market={market}
          onMarketChange={(next) => void changeMarket(next)}
          onScopeChange={(next) => {
            setScopeOverride(next);
            if (activeMarket) scheduleEstimate(target, next);
          }}
          onSubmit={(next, fresh) =>
            void analyze(
              next,
              fresh,
              Math.ceil((fresh ? estimate.freshCostCents : estimate.costCents) ?? 0),
            )
          }
          onTargetChange={updateTarget}
          scopeOverride={scopeOverride}
          submitting={submitting}
          target={target}
          trackedMarkets={context.trackedMarkets}
          report={report}
        />
      ) : null}
      <DomainOverviewRecentTargets
        currentTarget={report?.target}
        onOpen={openRecent}
        targets={recentTargets}
      />
      {submitting && !report ? (
        <DomainOverviewResultsLoading />
      ) : report && activeMarket ? (
        <DomainOverviewResults
          history={history?.data ?? null}
          historyError={historyError}
          historyEstimateCents={estimate.historyCostCents}
          historyLoading={historyLoading}
          market={activeMarket}
          onLoadHistory={() => void loadHistory()}
          onLoadMoreKeywords={() => void loadMore("keywords")}
          onLoadMorePages={() => void loadMore("pages")}
          projectRef={projectRef}
          report={report}
          tableEstimateCents={{
            keywords: estimate.keywordPageCostCents,
            pages: estimate.pagePageCostCents,
          }}
          tableError={tableError}
          tableFetchedCount={tableFetchedCount}
          tableHasMore={tableHasMore}
          tableLoading={loadingTable}
          saveSelectedKeywordsAction={saveSelectedKeywordsAction}
        />
      ) : (
        <DomainOverviewStatePanel
          charged={failureCharge(outcome)}
          market={market?.displayName}
          onRetry={
            activeMarket && blockedState === "lookup_failed" ? () => void analyze() : undefined
          }
          projectRef={projectRef}
          resetAt={failureResetAt(outcome)}
          state={blockedState ?? "idle"}
          target={target}
        />
      )}
    </section>
  );
}
