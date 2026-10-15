"use client";

import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import { MissingBudgetNotice } from "@/components/i18n/MissingBudgetNotice";
import { UsageReconciliationNotice } from "@/components/i18n/UsageReconciliationNotice";
import { WalletBudgetNotice } from "@/components/i18n/WalletBudgetNotice";
import type { AnalyzeBacklinksActionInput } from "@/lib/actions/backlinks";
import {
  type BacklinksSnapshot,
  type BacklinksFailedSummary as FailedSummary,
  isBacklinksEstimate,
  isBacklinksFailedSummary,
} from "@/lib/backlinks/types";
import { budgetDenialReason } from "@/lib/metering/budget-denial";
import type { BacklinkTargetScope } from "@/lib/providers/types";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AnalyzeCard } from "./AnalyzeCard";
import { BacklinksFailedSummary } from "./BacklinksFailedSummary";
import { BacklinksIdleState } from "./BacklinksIdleState";
import { BacklinksResultsLoading } from "./BacklinksLoadingSkeletons";
import { BacklinksResults } from "./BacklinksResults";
import {
  type BacklinksLimit,
  type BacklinksWorkspaceProps,
  type RecentBacklinksTarget,
  recentTargetKey,
} from "./backlinks-workspace-model";
import { RecentTargets } from "./RecentTargets";
import { useBacklinksEstimate } from "./useBacklinksEstimate";

type AnalyzeRequest = {
  fallbackOnCostLimit?: boolean;
  fresh?: boolean;
  overrides?: Omit<Partial<AnalyzeBacklinksActionInput>, "target">;
  target?: string;
};

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
  const [submitting, setSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState<BacklinksSnapshot | null>(null);
  const [failure, setFailure] = useState(false);
  const [walletBudgetBlocked, setWalletBudgetBlocked] = useState(false);
  const [budgetReason, setBudgetReason] = useState<ReturnType<typeof budgetDenialReason>>();
  const [failedSummary, setFailedSummary] = useState<FailedSummary | null>(null);
  const readOnly = Boolean(failedSummary) || snapshot?.provider === "unknown";

  const requestInput = (
    nextTarget: string,
    overrides: Partial<AnalyzeBacklinksActionInput> = {},
  ): AnalyzeBacklinksActionInput => ({
    includeSubdomains,
    mode: "as_is",
    projectId,
    ...(provider ? { provider } : {}),
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

  function clearResult() {
    setSnapshot(null);
    setFailure(false);
    setBudgetReason(undefined);
    setWalletBudgetBlocked(false);
    setFailedSummary(null);
  }

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
    setRecentTargets((current) =>
      [next, ...current.filter((item) => recentTargetKey(item) !== recentTargetKey(next))].slice(
        0,
        5,
      ),
    );
  }

  async function analyze(request: AnalyzeRequest = {}) {
    setSubmitting(true);
    setFailure(false);
    setBudgetReason(undefined);
    setWalletBudgetBlocked(false);
    setFailedSummary(null);
    try {
      const overrides = request.overrides ?? {};
      const nextTarget = request.target ?? target;
      const nextResultLimit = overrides.resultLimit ?? resultLimit;
      const estimatedMaxCostCents =
        estimate.costCents != null && estimate.costCents > 0
          ? Math.ceil(estimate.costCents)
          : undefined;
      const maxCostCents = overrides.maxCostCents ?? estimatedMaxCostCents;
      const outcome = await analyzeAction(
        requestInput(nextTarget, {
          ...overrides,
          estimateOnly: false,
          fresh: request.fresh ?? false,
          maxCostCents,
        }),
      );
      if (isBacklinksFailedSummary(outcome)) {
        setFailedSummary(outcome);
        return;
      }
      if (!outcome.ok) {
        setBudgetReason(budgetDenialReason(outcome));
        setWalletBudgetBlocked(outcome.reason === "wallet_budget_exhausted");
        if (request.fallbackOnCostLimit && outcome.reason === "cost_limit_exceeded") return;
        setFailure(true);
        return;
      }
      if (isBacklinksEstimate(outcome)) {
        setFailure(true);
        return;
      }
      addSpend(outcome.costCents);
      rememberTarget({
        cachedUntil: outcome.cachedUntil,
        fetchedAt: outcome.fetchedAt,
        includeSubdomains: outcome.includeSubdomains,
        provider: outcome.provider,
        resultLimit: nextResultLimit,
        target: outcome.target,
        targetScope: outcome.targetScope,
      });
      setSnapshot(outcome);
    } catch {
      setFailure(true);
    } finally {
      setSubmitting(false);
    }
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

  async function loadMoreRows(current: BacklinksSnapshot) {
    const outcome = await loadMoreAction({
      includeSubdomains: current.includeSubdomains,
      limit: 100,
      projectId,
      provider: current.provider,
      target: current.target,
      targetScope: current.targetScope,
    });
    if (outcome.ok) addSpend(outcome.costCents);
    return outcome;
  }

  return (
    <section aria-label={t("aria")} className="grid min-w-0 gap-4">
      <AnalyzeCard
        estimate={estimate}
        provider={provider}
        providers={context.providers}
        onProviderChange={(next) => {
          setProvider(next);
          clearResult();
          scheduleEstimate(target, { provider: next });
        }}
        includeSubdomains={includeSubdomains}
        onIncludeSubdomainsChange={setIncludeSubdomains}
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
            estimateCents={estimate.costCents}
            onLoadMore={readOnly ? undefined : () => loadMoreRows(snapshot)}
            onRefresh={readOnly ? undefined : () => void analyze({ fresh: true })}
            readOnly={readOnly}
            refreshing={submitting}
            snapshot={snapshot}
          />
        </div>
      ) : failedSummary ? null : (
        <BacklinksIdleState
          projectRef={projectId}
          state={context.providerStatus === "connected" ? "idle" : context.providerStatus}
        />
      )}
    </section>
  );
}
