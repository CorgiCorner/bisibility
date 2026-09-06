"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { useAppRealtime } from "@/components/shell/AppRealtimeProvider";
import { useLiveNow } from "@/components/ui";
import { formatDateTimeCurrentYear } from "@/lib/dates/format";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { useEffect, useRef, useState } from "react";
import { RunPageBlockedBanner } from "./RunPageBlockedBanner";
import { RunPageCancelDialog } from "./RunPageCancelDialog";
import { RunPageCounters } from "./RunPageCounters";
import { RunPageHeader } from "./RunPageHeader";
import { liveRun, orderedRunItems, type RunItemFilter, runSummary } from "./RunPageModel";
import { RunPageTargets } from "./RunPageTargets";
import type { RunPageData, RunPageInitialData, RunPageItem } from "./RunPageTypes";

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
  const dateFormat = useDateFormat();
  const { operations } = useAppRealtime();
  const [run, setRun] = useState(initialRun);
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [filter, setFilter] = useState<RunItemFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<RunMutation | null>(null);
  const [error, setError] = useState("");
  const currentRun = liveRun(run, operations);
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
  const summary = runSummary(currentRun, {
    formatInstant: (iso) => formatDateTimeCurrentYear(new Date(iso), dateFormat, new Date(now)),
    now,
  });
  const scopedProject = asProjectRef(projectRef);

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
        setRun(refreshed);
      })
      .catch(() => setError("The finished run could not be refreshed. Try again."));
  }, [hasRealtimeRun, projectRef, run.id]);

  async function mutate(mutation: RunMutation) {
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
      if (nextRun) setRun(nextRun);
      const retryId = nextRunId(payload);
      if (retryId) window.location.assign(appPath(scopedProject, "rank-tracker", "runs", retryId));
      setDialogOpen(false);
    } catch {
      setError("The run could not be updated. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    try {
      const response = await fetch(
        `/api/rank-check-runs/${currentRun.id}/items?project=${encodeURIComponent(projectRef)}&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const payload = (await response.json()) as {
        data?: RunPageItem[];
        meta?: { next_cursor?: string | null };
      };
      if (!response.ok || !Array.isArray(payload.data)) throw new Error("Unable to load targets.");
      const nextItems = payload.data;
      setItems((known) => [
        ...known,
        ...nextItems.filter((item) => !known.some((current) => current.id === item.id)),
      ]);
      setCursor(payload.meta?.next_cursor ?? null);
    } catch {
      setError("More targets could not be loaded. Try again.");
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
      <RunPageCounters
        onShowSkipped={() => setFilter("skipped")}
        run={currentRun}
        summary={summary}
      />
      <RunPageTargets
        busy={busy}
        canMutate={canMutate}
        cursor={cursor}
        filter={filter}
        items={orderedRunItems(items, filter, currentRun)}
        onFilter={setFilter}
        onLoadMore={() => void loadMore()}
        onMutate={(mutation) => void mutate(mutation)}
        onCancel={() => setDialogOpen(true)}
        projectRef={scopedProject}
        run={currentRun}
        summary={summary}
      />
      {error ? (
        <p className="m-0 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
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
