"use client";
import { ActionPaymentModal } from "@/components/action-payment/ActionPaymentModal";
import { ActionPaymentPrice } from "@/components/action-payment/ActionPaymentPrice";
import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { useActionPaymentReview } from "@/components/action-payment/useActionPaymentReview";
import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import { MissingBudgetNotice } from "@/components/i18n/MissingBudgetNotice";
import { UsageReconciliationNotice } from "@/components/i18n/UsageReconciliationNotice";
import { WalletBudgetNotice } from "@/components/i18n/WalletBudgetNotice";
import { ProviderAccessEmptyState } from "@/components/ui/ProviderAccessEmptyState";
import { ProviderAccessGate } from "@/components/ui/ProviderAccessGate";
import type { ActionPaymentOption } from "@/lib/action-payment/contract";
import type { AnalyzeBacklinksActionInput } from "@/lib/actions/backlinks";
import type { BacklinkTargetScope } from "@/lib/providers/types";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AnalyzeCard } from "./AnalyzeCard";
import { BacklinksFailedSummary } from "./BacklinksFailedSummary";
import { BacklinksIdleState } from "./BacklinksIdleState";
import { BacklinksResultsLoading } from "./BacklinksLoadingSkeletons";
import { BacklinksResults } from "./BacklinksResults";
import {
  backlinksAppendInput,
  backlinksRefreshInput,
  loadMoreWorkspaceRows,
  reviewedBacklinksAppendAction,
} from "./backlinks-append-state";
import {
  type BacklinksLimit,
  type BacklinksWorkspaceProps,
  type RecentBacklinksTarget,
  recentTargetKey,
} from "./backlinks-workspace-model";
import { RecentTargets } from "./RecentTargets";
import { useBacklinksEstimate } from "./useBacklinksEstimate";
import { useBacklinksRun } from "./useBacklinksRun";

export function BacklinksWorkspace({
  analyzeAction,
  context,
  initialEstimate,
  initialTarget = "",
  loadMoreAction,
  projectId,
}: Readonly<BacklinksWorkspaceProps>) {
  const t = useTranslations("projectBacklinks.workspace");
  const { addSpend } = useSessionSpend();
  const [target, setTarget] = useState(initialTarget);
  const [scope, setScope] = useState<BacklinkTargetScope>("site");
  const [resultLimit, setResultLimit] = useState<BacklinksLimit>(100);
  const [includeSubdomains, setIncludeSubdomains] = useState(true);
  const [provider, setProvider] = useState(context.providers?.[0]?.value);
  const [recentTargets, setRecentTargets] = useState(context.recentTargets);
  const [paymentOption, setPaymentOption] = useState<ActionPaymentOption>();
  const paymentReview = useActionPaymentReview();
  const providerReady = context.providerStatus === "connected";

  const requestInput = (
    nextTarget: string,
    overrides: Partial<AnalyzeBacklinksActionInput> = {},
  ): AnalyzeBacklinksActionInput => ({
    includeSubdomains,
    mode: "as_is",
    projectId,
    ...(provider ? { provider } : {}),
    ...(paymentOption
      ? { paymentOptionId: paymentOption.id, provider: paymentOption.providerId }
      : {}),
    resultLimit,
    target: nextTarget,
    targetScope: scope,
    ...overrides,
  });
  const { estimate, scheduleEstimate } = useBacklinksEstimate(
    analyzeAction,
    requestInput,
    initialEstimate,
  );

  const {
    analyze,
    unresolved,
    submitting,
    snapshot,
    setSnapshot,
    failure,
    failurePayment,
    walletBudgetBlocked,
    budgetReason,
    failedSummary,
    clearResult,
  } = useBacklinksRun({
    analyzeAction,
    requestInput,
    target,
    resultLimit,
    paymentReview,
    addSpend,
    rememberTarget,
  });
  const readOnly =
    !providerReady || unresolved || Boolean(failedSummary) || snapshot?.provider === "unknown";

  function updateTarget(nextTarget: string) {
    setTarget(nextTarget);
    clearResult();
    scheduleEstimate(nextTarget);
  }

  function selectTarget(
    nextTarget: string,
    nextScope: BacklinkTargetScope = "site",
    nextIncludeSubdomains = true,
    nextResultLimit: BacklinksLimit = resultLimit,
    nextProvider = provider,
  ) {
    setTarget(nextTarget);
    setScope(nextScope);
    setIncludeSubdomains(nextScope === "site" && nextIncludeSubdomains);
    setResultLimit(nextResultLimit);
    setProvider(nextProvider);
    clearResult();
    scheduleEstimate(nextTarget, {
      includeSubdomains: nextScope === "site" && nextIncludeSubdomains,
      resultLimit: nextResultLimit,
      provider: nextProvider,
      targetScope: nextScope,
    });
  }

  function rememberTarget(next: RecentBacklinksTarget) {
    const key = recentTargetKey(next);
    setRecentTargets((current) =>
      [next, ...current.filter((item) => recentTargetKey(item) !== key)].slice(0, 5),
    );
  }

  function openRecentTarget(recent: RecentBacklinksTarget) {
    selectTarget(
      recent.target,
      recent.targetScope,
      recent.includeSubdomains,
      recent.resultLimit,
      recent.provider ?? provider,
    );
    if (!(new Date(recent.cachedUntil).getTime() > Date.now())) return;
    void analyze({
      fallbackOnCostLimit: true,
      overrides: {
        includeSubdomains: recent.includeSubdomains,
        maxCostCents: 0,
        ...(recent.provider ? { provider: recent.provider } : {}),
        resultLimit: recent.resultLimit,
        targetScope: recent.targetScope,
      },
      target: recent.target,
    });
  }

  return (
    <section aria-label={t("aria")} className="grid min-w-0 gap-4">
      <ProviderAccessGate
        showNotice={Boolean(snapshot || failedSummary)}
        surface="backlinks"
        blocked={
          context.providerStatus === "no_provider" || context.providerStatus === "needs_reauth"
        }
        reconnect={context.providerStatus === "needs_reauth"}
        providers={context.supportingProviders}
        href={appPath(projectId, "integrations")}
      >
        <AnalyzeCard
          disabled={unresolved}
          estimate={estimate}
          onPaymentOptionChange={(option) => {
            setPaymentOption(option);
            scheduleEstimate(target, { paymentOptionId: option.id, provider: option.providerId });
          }}
          provider={provider}
          providers={context.providers}
          onProviderChange={(next) => {
            setProvider(next);
            setPaymentOption(undefined);
            clearResult();
            scheduleEstimate(target, { provider: next });
          }}
          includeSubdomains={includeSubdomains}
          onIncludeSubdomainsChange={(value) => {
            setIncludeSubdomains(value);
            scheduleEstimate(target, { includeSubdomains: value });
          }}
          onLimitChange={(limit) => {
            setResultLimit(limit);
            scheduleEstimate(target, { resultLimit: limit });
          }}
          onScopeChange={(nextScope) => {
            setScope(nextScope);
            const nextIncludeSubdomains = nextScope === "page" ? false : includeSubdomains;
            if (nextScope === "page") setIncludeSubdomains(false);
            scheduleEstimate(target, {
              includeSubdomains: nextIncludeSubdomains,
              targetScope: nextScope,
            });
          }}
          onSubmit={() => void analyze()}
          onTargetChange={updateTarget}
          resultLimit={resultLimit}
          scope={scope}
          submitting={submitting}
          target={target}
        />
      </ProviderAccessGate>
      <ActionPaymentModal review={paymentReview} />
      {failurePayment && !failedSummary ? <PaymentChargeLine payment={failurePayment} /> : null}
      <RecentTargets
        onOpen={openRecentTarget}
        onRemove={(recent) =>
          setRecentTargets((current) =>
            current.filter((item) => recentTargetKey(item) !== recentTargetKey(recent)),
          )
        }
        targets={recentTargets}
      />
      {failedSummary ? <BacklinksFailedSummary evidence={failedSummary} /> : null}
      {walletBudgetBlocked ? (
        <WalletBudgetNotice />
      ) : budgetReason === "usage_reconciliation_required" ? (
        <UsageReconciliationNotice />
      ) : budgetReason === "budget_missing" ? (
        <MissingBudgetNotice />
      ) : failure ? (
        <p className="m-0 text-center text-[13px] text-red-text" role="status">
          {t("loadFailed")}
        </p>
      ) : null}
      {submitting ? (
        <BacklinksResultsLoading />
      ) : snapshot ? (
        <div className="grid min-w-0 gap-3">
          {failedSummary ? (
            <p className="m-0 text-[13px] font-semibold text-fg-muted">
              {t("failedSummary.previousResult")}
            </p>
          ) : null}
          <BacklinksResults
            estimateCents={null}
            refreshPrice={
              <ActionPaymentPrice
                action={analyzeAction}
                input={backlinksRefreshInput(projectId, snapshot, resultLimit)}
              />
            }
            loadMorePrice={
              <ActionPaymentPrice
                action={loadMoreAction}
                input={backlinksAppendInput(projectId, snapshot)}
              />
            }
            onLoadMore={
              readOnly
                ? undefined
                : () =>
                    loadMoreWorkspaceRows(
                      reviewedBacklinksAppendAction(paymentReview, loadMoreAction, snapshot.target),
                      projectId,
                      snapshot,
                      addSpend,
                      setSnapshot,
                    )
            }
            onRefresh={
              readOnly
                ? undefined
                : () =>
                    void analyze({
                      target: snapshot.target,
                      fresh: true,
                      overrides: backlinksRefreshInput(projectId, snapshot, resultLimit),
                    })
            }
            readOnly={readOnly}
            refreshing={submitting}
            snapshot={snapshot}
          />
        </div>
      ) : failedSummary ? null : context.providerStatus !== "connected" ? (
        <ProviderAccessEmptyState
          surface="backlinks"
          href={appPath(projectId, "integrations")}
          providers={context.supportingProviders}
          reconnect={context.providerStatus === "needs_reauth"}
        />
      ) : (
        <BacklinksIdleState projectRef={projectId} />
      )}
    </section>
  );
}
