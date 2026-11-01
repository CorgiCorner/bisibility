"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { NewResultsBanner } from "@/components/realtime/NewResultsBanner";
import { useHeldRows } from "@/components/realtime/useHeldRows";
import { useAppRealtime } from "@/components/shell/AppRealtimeProvider";
import { useLiveNow } from "@/components/ui/useLiveNow";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { RetryDeferredDialog } from "./RetryDeferredDialog";
import { RunPageBlockedBanner } from "./RunPageBlockedBanner";
import { RunPageCancelDialog } from "./RunPageCancelDialog";
import { RunPageCounters } from "./RunPageCounters";
import { RunPageHeader } from "./RunPageHeader";
import { liveRun, orderedRunItems, type RunItemFilter, runSummary } from "./RunPageModel";
import { RunPageTargets } from "./RunPageTargets";
import type { RunPageData, RunPageInitialData } from "./RunPageTypes";
import { createRunPageSummaryLabels } from "./run-page-summary-presentation";
import { useRunPageItems } from "./useRunPageItems";

type RunMutation = "cancel" | "run-now" | "skip" | "retry-failed" | "retry-deferred";

type RunPageProps = RunPageInitialData & { canMutate: boolean; projectRef: string };

function operationPath(id: string, mutation: RunMutation): string {
  if (mutation === "retry-failed" || mutation === "retry-deferred") {
    return `/api/rank-check-runs/${id}/retry`;
  }
  return `/api/rank-check-runs/${id}/${mutation}`;
}

function operationBody(projectId: string, mutation: RunMutation): Record<string, string> {
  if (mutation === "retry-failed") return { projectId, relation: "retry_failed" };
  if (mutation === "retry-deferred") return { projectId, relation: "retry_deferred" };
  return { projectId };
}

function runFromResponse(value: unknown): RunPageData | null {
  const data = value && typeof value === "object" ? (value as { data?: unknown }).data : null;
  if (!data || typeof data !== "object") return null;
  const candidate = data as Partial<RunPageData>;
  return typeof candidate.id === "string" && candidate.counts ? (candidate as RunPageData) : null;
}

function nextRunId(value: unknown): string | null {
  const data =
    value && typeof value === "object" ? (value as { data?: { publicId?: unknown } }).data : null;
  return typeof data?.publicId === "string" ? data.publicId : null;
}

export function RunPage({
  canMutate,
  items: initialItems,
  nextCursor: initialCursor,
  now: initialNow,
  projectRef,
  run: initialRun,
}: Readonly<RunPageProps>) {
  const dateDisplay = useDateDisplay();
  const locale = useLocale();
  const t = useTranslations("projectRuns.rankRuns");
  const paymentT = useTranslations("shared.actionPayment");
  const statusT = useTranslations("shared.controls.status");
  const { operations, rankDataVersion = 0 } = useAppRealtime();
  const [run, setRun] = useState(initialRun);
  const [serverRun, setServerRun] = useState(initialRun);
  if (serverRun !== initialRun) {
    setServerRun(initialRun);
    setRun(initialRun);
  }
  const [filter, setFilter] = useState<RunItemFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [busy, setBusy] = useState<RunMutation | null>(null);
  const [error, setError] = useState("");
  const { items, cursor, loadMore } = useRunPageItems(
    { projectRef, runId: initialRun.id },
    initialItems,
    initialCursor,
    rankDataVersion,
    setError,
    t("loadingTargets"),
  );
  const currentRun = liveRun(run, operations);
  const ordered = useMemo(
    () => orderedRunItems(items, filter, { status: currentRun.status }),
    [items, filter, currentRun.status],
  );
  const held = useHeldRows(
    ordered,
    `${projectRef}/${initialRun.id}/${filter}`,
    rankDataVersion,
    true,
  );
  const listFocus = useRef<HTMLDivElement>(null);
  const hasRealtimeRun = operations.some(
    (operation) => operation.kind === "rank_check" && operation.id === run.id,
  );
  const sawRealtimeRun = useRef(false);
  const now = useLiveNow(
    initialNow,
    currentRun.status === "queued" ||
      currentRun.status === "running" ||
      currentRun.status === "cancelling",
  );
  const summary = runSummary(
    currentRun,
    { now },
    createRunPageSummaryLabels({ currentRun, dateDisplay, locale, now, statusT, t, paymentT }),
  );
  const scopedProject = asProjectRef(projectRef);
  const sealed = Boolean(
    run.selectionSpec &&
      typeof run.selectionSpec === "object" &&
      "rankPaymentConsent" in run.selectionSpec,
  );

  // Synchronize the persisted detail with the external realtime snapshot when it becomes terminal.
  useEffect(() => {
    if (hasRealtimeRun) {
      sawRealtimeRun.current = true;
      return;
    }
    if (!sawRealtimeRun.current) return;
    sawRealtimeRun.current = false;

    void fetch(`/api/rank-check-runs/${run.id}?project=${encodeURIComponent(projectRef)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Run refresh failed.");
        const refreshed = runFromResponse(await response.json());
        if (!refreshed) throw new Error("Run refresh payload was invalid.");
        setRun({ ...refreshed, sharedDeferralCode: run.sharedDeferralCode });
      })
      .catch(() => setError(t("runsRefreshFailed")));
  }, [hasRealtimeRun, projectRef, run.id, run.sharedDeferralCode, t]);

  async function mutate(mutation: RunMutation) {
    held.immediate();
    setBusy(mutation);
    setError("");
    try {
      const response = await fetch(operationPath(currentRun.id, mutation), {
        body: JSON.stringify(operationBody(projectRef, mutation)),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("The run could not be updated.");
      const nextRun = runFromResponse(payload);
      if (nextRun) setRun({ ...nextRun, sharedDeferralCode: run.sharedDeferralCode });
      const retryId = nextRunId(payload);
      if (retryId) window.location.assign(appPath(scopedProject, "rank-tracker", "runs", retryId));
      setDialogOpen(false);
      setRetryOpen(false);
    } catch {
      setError(t("updateFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      <RunPageHeader
        canMutate={canMutate}
        onCancel={() => setDialogOpen(true)}
        projectRef={scopedProject}
        run={currentRun}
        summary={summary}
        now={now}
      />
      <RunPageBlockedBanner projectRef={scopedProject} run={currentRun} />
      {sealed && run.hasAccountDeferred ? (
        <section className="rounded-card border border-yellow/35 bg-yellow/10 px-4 py-3 text-[12px] text-fg-muted">
          <p className="m-0">{t("sealedAccountPaused")}</p>
          <a className="mt-2 inline-block underline" href={appPath(scopedProject, "rank-tracker")}>
            {t("startNewRun")}
          </a>
        </section>
      ) : null}
      <RunPageCounters
        onShowSkipped={() => setFilter("skipped")}
        run={currentRun}
        summary={summary}
      />
      {held.pending ? <NewResultsBanner onShow={held.show} focusRef={listFocus} /> : null}
      <div ref={listFocus} tabIndex={-1} aria-labelledby="run-targets-title">
        <RunPageTargets
          busy={busy}
          canMutate={canMutate}
          cursor={cursor}
          filter={filter}
          items={held.rows}
          onFilter={setFilter}
          onLoadMore={() => {
            held.immediate();
            void loadMore();
          }}
          onMutate={(mutation) =>
            mutation === "retry-deferred" ? setRetryOpen(true) : void mutate(mutation)
          }
          onCancel={() => setDialogOpen(true)}
          projectRef={scopedProject}
          run={currentRun}
          summary={summary}
        />
      </div>
      {error ? (
        <p className="m-0 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      <RetryDeferredDialog
        open={retryOpen}
        busy={busy === "retry-deferred"}
        projectRef={projectRef}
        runId={run.id}
        onClose={() => setRetryOpen(false)}
        onConfirm={() => void mutate("retry-deferred")}
      />
      <RunPageCancelDialog
        busy={busy === "cancel"}
        onClose={() => setDialogOpen(false)}
        onConfirm={() => void mutate("cancel")}
        open={dialogOpen}
        run={currentRun}
      />
    </div>
  );
}
