"use client";

import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import type { DomainOverviewScope, DomainRecentTarget } from "@/lib/domain-overview/types";
import { researchScopeKey } from "@/lib/research/scope";
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
  supportedResearchScope,
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
  projectId,
  projectRef,
  researchScope,
  saveSelectedKeywordsAction,
}: Readonly<DomainOverviewWorkspaceProps>) {
  const router = useRouter();
  const { addSpend } = useSessionSpend();
  const activeResearchScope = supportedResearchScope(researchScope);
  const [target, setTarget] = useState(initialTarget);
  const [domainScopeOverride, setDomainScopeOverride] = useState<DomainOverviewScope | undefined>(
    detectedDomainScope(initialTarget) === "root" ? undefined : initialScope,
  );
  const [outcome, setOutcome] = useState<DomainOverviewUiOutcome | null>(initialOutcome);
  const [submitting, setSubmitting] = useState(false);
  const report = reportFrom(outcome);
  const requestInput = (nextTarget: string, nextScope = domainScopeOverride) =>
    activeResearchScope
      ? estimateInput({
          domainScope: nextScope,
          projectId,
          researchScope: activeResearchScope,
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
      activeResearchScope,
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
      activeResearchScope,
      addSpend,
      estimate,
      loadHistoryAction,
      projectId,
      report,
    });
  const recentTargets = context.recentTargets.filter(
    (recent) =>
      activeResearchScope &&
      recent.locationCode === activeResearchScope.providerLocationCode &&
      recent.languageCode === activeResearchScope.languageCode,
  );

  function updateTarget(nextTarget: string) {
    const nextScope = detectedDomainScope(nextTarget) === "root" ? undefined : domainScopeOverride;
    setTarget(nextTarget);
    if (nextScope !== domainScopeOverride) setDomainScopeOverride(nextScope);
    if (activeResearchScope) scheduleEstimate(nextTarget, nextScope);
  }

  function changeResearchScope(next: NonNullable<typeof researchScope>) {
    if (!researchScope || researchScopeKey(next) === researchScopeKey(researchScope)) return;
    const params = new URLSearchParams({ researchScope: researchScopeKey(next) });
    if (target.trim()) params.set("domain", target.trim());
    if (domainScopeOverride) params.set("scope", domainScopeOverride);
    router.push(`${appPath(projectRef, "domain-overview")}?${params.toString()}`);
  }

  async function analyze(
    nextTarget = target,
    fresh = false,
    maxCostCents = Math.ceil(estimate.costCents ?? 0),
    nextScope = domainScopeOverride,
  ) {
    if (!activeResearchScope) return;
    setSubmitting(true);
    resetHistory();
    try {
      const result = await analyzeAction({
        countryCode: activeResearchScope.countryCode,
        estimateOnly: false,
        fresh,
        languageCode: activeResearchScope.languageCode,
        locationCode: activeResearchScope.providerLocationCode,
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
        setDomainScopeOverride(result.scope === "root" ? undefined : result.scope);
        window.history.replaceState(
          null,
          "",
          reportUrl({
            domainScope: result.scope,
            projectRef,
            researchScope: activeResearchScope,
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
    if (!activeResearchScope) return;
    setSubmitting(true);
    router.push(
      reportUrl({
        domainScope: recent.scope,
        projectRef,
        researchScope: activeResearchScope,
        target: recent.target,
      }),
    );
  }

  const blockedState =
    context.providerStatus === "no_provider"
      ? "no_provider"
      : context.providerStatus === "needs_reauth"
        ? "needs_reauth"
        : !researchScope?.researchAvailable || !activeResearchScope
          ? "unsupported_location"
          : failureState(outcome);

  return (
    <section aria-label="Domain Overview" className="grid min-w-0 gap-4">
      {researchScope ? (
        <DomainOverviewAnalyzeCard
          catalogScopes={context.catalogScopes}
          estimate={estimate}
          onResearchScopeChange={changeResearchScope}
          onScopeChange={(next) => {
            setDomainScopeOverride(next);
            if (activeResearchScope) scheduleEstimate(target, next);
          }}
          onSubmit={(next, fresh) =>
            void analyze(
              next,
              fresh,
              Math.ceil((fresh ? estimate.freshCostCents : estimate.costCents) ?? 0),
            )
          }
          onTargetChange={updateTarget}
          report={report}
          researchScope={researchScope}
          scopeOverride={domainScopeOverride}
          submitting={submitting}
          target={target}
          trackedScopes={context.trackedScopes}
        />
      ) : null}
      <DomainOverviewRecentTargets
        currentTarget={report?.target}
        onOpen={openRecent}
        targets={recentTargets}
      />
      {submitting && !report ? (
        <DomainOverviewResultsLoading />
      ) : report && activeResearchScope ? (
        <DomainOverviewResults
          history={history?.data ?? null}
          historyError={historyError}
          historyEstimateCents={estimate.historyCostCents}
          historyLoading={historyLoading}
          onLoadHistory={() => void loadHistory()}
          onLoadMoreKeywords={() => void loadMore("keywords")}
          onLoadMorePages={() => void loadMore("pages")}
          projectRef={projectRef}
          report={report}
          researchScope={activeResearchScope}
          saveSelectedKeywordsAction={saveSelectedKeywordsAction}
          tableEstimateCents={{
            keywords: estimate.keywordPageCostCents,
            pages: estimate.pagePageCostCents,
          }}
          tableError={tableError}
          tableFetchedCount={tableFetchedCount}
          tableHasMore={tableHasMore}
          tableLoading={loadingTable}
        />
      ) : (
        <DomainOverviewStatePanel
          charged={failureCharge(outcome)}
          onRetry={
            activeResearchScope && blockedState === "lookup_failed"
              ? () => void analyze()
              : undefined
          }
          projectRef={projectRef}
          researchScope={researchScope}
          resetAt={failureResetAt(outcome)}
          state={blockedState ?? "idle"}
          target={target}
        />
      )}
    </section>
  );
}
