"use client";

import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import type { AnalyzeBacklinksActionInput } from "@/lib/actions/backlinks";
import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import type { BacklinkTargetScope } from "@/lib/providers/types";
import { useState } from "react";
import { AnalyzeCard } from "./AnalyzeCard";
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
  loadMoreAction,
  projectId,
  suggestedEstimateCents,
}: Readonly<BacklinksWorkspaceProps>) {
  const { addSpend } = useSessionSpend();
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState<BacklinkTargetScope>("site");
  const [resultLimit, setResultLimit] = useState<BacklinksLimit>(100);
  const [includeSubdomains, setIncludeSubdomains] = useState(true);
  const [recentTargets, setRecentTargets] = useState(context.recentTargets);
  const [submitting, setSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState<BacklinksSnapshot | null>(null);
  const [failure, setFailure] = useState(false);

  const requestInput = (
    nextTarget: string,
    overrides: Partial<AnalyzeBacklinksActionInput> = {},
  ): AnalyzeBacklinksActionInput => ({
    includeSubdomains,
    mode: "as_is",
    projectId,
    resultLimit,
    target: nextTarget,
    targetScope: scope,
    ...overrides,
  });
  const { estimate, scheduleEstimate } = useBacklinksEstimate(analyzeAction, requestInput);

  function updateTarget(nextTarget: string) {
    setTarget(nextTarget);
    setSnapshot(null);
    setFailure(false);
    scheduleEstimate(nextTarget);
  }

  function selectTarget(
    nextTarget: string,
    nextScope: BacklinkTargetScope = "site",
    nextIncludeSubdomains = true,
    nextResultLimit: BacklinksLimit = resultLimit,
  ) {
    setTarget(nextTarget);
    setScope(nextScope);
    setIncludeSubdomains(nextScope === "site" && nextIncludeSubdomains);
    setResultLimit(nextResultLimit);
    setSnapshot(null);
    setFailure(false);
    scheduleEstimate(nextTarget, {
      includeSubdomains: nextScope === "site" && nextIncludeSubdomains,
      resultLimit: nextResultLimit,
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
      if (!outcome.ok) {
        if (request.fallbackOnCostLimit && outcome.reason === "cost_limit_exceeded") return;
        setFailure(true);
        return;
      }
      addSpend(outcome.costCents);
      rememberTarget({
        cachedUntil: outcome.cachedUntil,
        fetchedAt: outcome.fetchedAt,
        includeSubdomains: outcome.includeSubdomains,
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
    selectTarget(recent.target, recent.targetScope, recent.includeSubdomains, recent.resultLimit);
    if (!(new Date(recent.cachedUntil).getTime() > Date.now())) return;
    void analyze({
      fallbackOnCostLimit: true,
      overrides: {
        includeSubdomains: recent.includeSubdomains,
        maxCostCents: 0,
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
      target: current.target,
      targetScope: current.targetScope,
    });
    if (outcome.ok) addSpend(outcome.costCents);
    return outcome;
  }

  return (
    <section aria-label="Backlinks" className="grid min-w-0 gap-4">
      <AnalyzeCard
        estimate={estimate}
        includeSubdomains={includeSubdomains}
        onIncludeSubdomainsChange={setIncludeSubdomains}
        onLimitChange={(limit) => {
          setResultLimit(limit);
          scheduleEstimate(target, { resultLimit: limit });
        }}
        onScopeChange={(nextScope) => {
          setScope(nextScope);
          if (nextScope === "page") setIncludeSubdomains(false);
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
      {failure ? (
        <p className="m-0 text-center text-[13px] text-red-text" role="status">
          Backlinks could not be loaded. Check the target, provider connection, and budget.
        </p>
      ) : null}
      {submitting ? (
        <BacklinksResultsLoading />
      ) : snapshot ? (
        <BacklinksResults
          estimateCents={estimate.costCents}
          onLoadMore={() => loadMoreRows(snapshot)}
          onRefresh={() => void analyze({ fresh: true })}
          refreshing={submitting}
          snapshot={snapshot}
        />
      ) : (
        <BacklinksIdleState
          estimateCents={suggestedEstimateCents}
          onSelectTarget={(nextTarget) => selectTarget(nextTarget)}
          suggestions={[{ kind: "project", target: context.defaultTarget }]}
        />
      )}
    </section>
  );
}
