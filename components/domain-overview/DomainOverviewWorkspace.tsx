"use client";
import { ActionPaymentModal } from "@/components/action-payment/ActionPaymentModal";
import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { useActionPaymentReview } from "@/components/action-payment/useActionPaymentReview";
import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import { ProviderAccessEmptyState } from "@/components/ui/ProviderAccessEmptyState";
import { ProviderAccessGate } from "@/components/ui/ProviderAccessGate";
import type { ActionPaymentOption } from "@/lib/action-payment/contract";
import type { DomainOverviewScope } from "@/lib/domain-overview/types";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DomainOverviewAnalyzeCard } from "./DomainOverviewAnalyzeCard";
import { DomainOverviewResultsLoading } from "./DomainOverviewLoadingSkeletons";
import { DomainOverviewRecentTargets } from "./DomainOverviewRecentTargets";
import { DomainOverviewResults } from "./DomainOverviewResults";
import { DomainOverviewStatePanel } from "./DomainOverviewStatePanel";
import {
  type DomainOverviewWorkspaceProps,
  detectedDomainScope,
  estimateInput,
  failureCharge,
  failureResetAt,
  failureState,
  reportFrom,
  supportedResearchScope,
} from "./domain-overview-workspace-model";
import { useDomainOverviewEstimate } from "./useDomainOverviewEstimate";
import { useDomainOverviewHistory } from "./useDomainOverviewHistory";
import { useDomainOverviewNavigation } from "./useDomainOverviewNavigation";
import { useDomainOverviewRun } from "./useDomainOverviewRun";
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
  researchScope = null,
  saveSelectedKeywordsAction,
}: Readonly<DomainOverviewWorkspaceProps>) {
  const t = useTranslations("projectDomainOverview.workspace");
  const uiT = useTranslations("projectDomainOverview.workspace.ui");
  const { addSpend } = useSessionSpend();
  const activeResearchScope = supportedResearchScope(researchScope);
  const providerReady = context.providerStatus === "connected";
  const [target, setTarget] = useState(initialTarget);
  const [domainScopeOverride, setDomainScopeOverride] = useState<DomainOverviewScope | undefined>(
    detectedDomainScope(initialTarget) === "root" ? undefined : initialScope,
  );
  const [paymentOption, setPaymentOption] = useState<ActionPaymentOption>();
  const paymentReview = useActionPaymentReview();
  const requestInput = (nextTarget: string, nextScope = domainScopeOverride) =>
    activeResearchScope
      ? {
          ...estimateInput({
            domainScope: nextScope,
            projectId,
            researchScope: activeResearchScope,
            target: nextTarget,
          }),
          ...(paymentOption ? { paymentOptionId: paymentOption.id } : {}),
        }
      : { estimateOnly: true, projectId, target: nextTarget };
  const { estimate, scheduleEstimate } = useDomainOverviewEstimate(
    analyzeAction,
    requestInput,
    initialEstimate,
  );
  const navigation = useDomainOverviewNavigation({
    projectRef,
    target,
    domainScope: domainScopeOverride,
    researchScope,
    activeResearchScope,
    setTarget,
    setScope: setDomainScopeOverride,
  });
  const run = useDomainOverviewRun({
    analyzeAction,
    initialOutcome,
    paymentReview,
    requestInput,
    target,
    scope: domainScopeOverride,
    ready: Boolean(activeResearchScope),
    addSpend,
    onSuccess: navigation.acceptReport,
  });
  const { outcome, setOutcome, submitting, analyze } = run;
  const report = reportFrom(outcome);
  const {
    loadMore,
    loadingTable,
    tableError,
    tableFetchedCount,
    tableHasMore,
    tableBlocked,
    tablePayments,
    tableQuoteInputs,
  } = useDomainOverviewTablePages({
    activeResearchScope,
    addSpend,
    estimate,
    loadKeywordsPageAction: (input) =>
      paymentReview.request(
        loadKeywordsPageAction,
        input as Record<string, unknown> & { projectId: string },
        report?.target ?? target,
      ),
    loadPagesPageAction: (input) =>
      paymentReview.request(
        loadPagesPageAction,
        input as Record<string, unknown> & { projectId: string },
        report?.target ?? target,
      ),
    projectId,
    report,
    setOutcome,
  });
  const {
    history,
    historyError,
    historyLoading,
    loadHistory,
    historyBlocked,
    historyPayment,
    historyQuoteInput,
  } = useDomainOverviewHistory({
    activeResearchScope,
    addSpend,
    estimate,
    loadHistoryAction: (input) =>
      paymentReview.request(
        loadHistoryAction,
        input as Record<string, unknown> & { projectId: string },
        report?.target ?? target,
      ),
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
    run.clearUnresolved();
    if (nextScope !== domainScopeOverride) setDomainScopeOverride(nextScope);
    if (activeResearchScope) scheduleEstimate(nextTarget, nextScope);
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
    <section aria-label={t("aria")} className="grid min-w-0 gap-4">
      <ProviderAccessGate
        showNotice={Boolean(report)}
        surface="domain"
        blocked={
          context.providerStatus === "no_provider" || context.providerStatus === "needs_reauth"
        }
        reconnect={context.providerStatus === "needs_reauth"}
        providers={context.supportingProviders}
        href={appPath(projectRef, "integrations")}
      >
        <DomainOverviewAnalyzeCard
          catalogScopes={context.catalogScopes}
          estimate={estimate}
          onResearchScopeChange={navigation.changeResearchScope}
          onScopeChange={(next) => {
            setDomainScopeOverride(next);
            if (activeResearchScope) scheduleEstimate(target, next);
          }}
          onSubmit={(next, fresh) => void analyze(next, fresh)}
          disabled={run.unresolved}
          onPaymentOptionChange={(option) => {
            setPaymentOption(option);
            scheduleEstimate(target, domainScopeOverride, option.id);
          }}
          onTargetChange={updateTarget}
          report={report}
          researchScope={researchScope}
          scopeOverride={domainScopeOverride}
          submitting={submitting}
          target={target}
          trackedScopes={context.trackedScopes}
        />
      </ProviderAccessGate>
      <ActionPaymentModal review={paymentReview} />
      {report && run.failure ? (
        <DomainOverviewStatePanel
          charged={failureCharge(run.failure)}
          projectRef={projectRef}
          researchScope={researchScope}
          state={failureState(run.failure) ?? "lookup_failed"}
        />
      ) : null}
      {run.failure && "payment" in run.failure ? (
        <PaymentChargeLine payment={run.failure.payment} />
      ) : null}
      <DomainOverviewRecentTargets
        currentTarget={report?.target}
        onOpen={navigation.openRecent}
        targets={recentTargets}
      />
      {submitting && !report ? (
        <DomainOverviewResultsLoading ariaLabel={uiT("loading")} />
      ) : report && activeResearchScope ? (
        <DomainOverviewResults
          history={history?.data ?? null}
          historyBlocked={historyBlocked}
          historyPayment={historyPayment}
          tableBlocked={tableBlocked}
          tablePayments={tablePayments}
          onRefresh={
            providerReady && !run.unresolved
              ? () => void analyze(report.target, true, report.scope)
              : undefined
          }
          paymentActions={{
            analyze: analyzeAction,
            history: loadHistoryAction,
            keywords: loadKeywordsPageAction,
            pages: loadPagesPageAction,
          }}
          refreshing={submitting}
          refreshInput={
            activeResearchScope
              ? { ...requestInput(report.target, report.scope), fresh: true }
              : null
          }
          paymentInputs={{
            history: historyQuoteInput,
            keywords: tableQuoteInputs?.keywords ?? null,
            pages: tableQuoteInputs?.pages ?? null,
          }}
          historyError={historyError}
          historyEstimateCents={estimate.historyCostCents}
          historyLoading={historyLoading}
          onLoadHistory={providerReady && !run.unresolved ? () => void loadHistory() : undefined}
          onLoadMoreKeywords={
            providerReady && !run.unresolved ? () => void loadMore("keywords") : undefined
          }
          onLoadMorePages={
            providerReady && !run.unresolved ? () => void loadMore("pages") : undefined
          }
          projectRef={projectRef}
          report={report}
          researchScope={activeResearchScope}
          saveSelectedKeywordsAction={saveSelectedKeywordsAction}
          tableError={tableError}
          tableFetchedCount={tableFetchedCount}
          tableHasMore={tableHasMore}
          tableLoading={loadingTable}
        />
      ) : blockedState === "no_provider" || blockedState === "needs_reauth" ? (
        <ProviderAccessEmptyState
          surface="domain"
          href={appPath(projectRef, "integrations")}
          providers={context.supportingProviders}
          reconnect={blockedState === "needs_reauth"}
        />
      ) : (
        <DomainOverviewStatePanel
          charged={failureCharge(outcome)}
          onRetry={
            activeResearchScope && blockedState === "lookup_failed" && !run.unresolved
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
