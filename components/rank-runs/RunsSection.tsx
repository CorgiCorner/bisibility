"use client";

import { useAppRealtime } from "@/components/shell/AppRealtimeProvider";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { rankCheckOperationSchema } from "@/lib/rank-check/runs/contract";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { z } from "zod";
import { type BudgetNotice, BudgetNotices } from "./BudgetNotices";
import { PlannedSection } from "./PlannedSection";
import { RunsTable } from "./RunsTable";
import { isSkippedOccurrence } from "./runs-format";
import type { RankRunPage, RankRunRecord, RunsSegment } from "./runs-types";

const rankRunRecordSchema = rankCheckOperationSchema
  .extend({
    checkSchedulePublicId: z.string().nullable().optional(),
    launchedAt: z.iso.datetime().nullable(),
    requestedBy: z
      .object({
        avatarUrl: z.string().nullable(),
        initials: z.string(),
        name: z.string().nullable(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .passthrough();

const rankRunListSchema = z
  .object({
    data: rankRunRecordSchema.array(),
    meta: z.object({ next_cursor: z.string().nullable() }).strict(),
  })
  .strict();

const rankRunMutationSchema = z.object({ data: rankRunRecordSchema }).strict();

export type RunsSectionProps = {
  budgetExhausted?: boolean;
  budgetSettingsHref?: string;
  initialHistory: RankRunPage;
  initialPlanned: RankRunPage;
  initialSegment?: RunsSegment;
  notices?: readonly BudgetNotice[];
  projectRef: string;
  schedulesHref: string;
};

function appendRuns(current: readonly RankRunRecord[], next: readonly RankRunRecord[]) {
  const seen = new Set(current.map((run) => run.id));
  return [
    ...current.map((run) => {
      const update = next.find((candidate) => candidate.id === run.id);
      return update ? { ...run, ...update } : run;
    }),
    ...next.filter((run) => !seen.has(run.id)),
  ];
}

function prependFreshRuns(current: readonly RankRunRecord[], next: readonly RankRunRecord[]) {
  const freshIds = new Set(next.map((run) => run.id));
  return [...next, ...current.filter((run) => !freshIds.has(run.id))];
}

function mergeLiveRuns(current: readonly RankRunRecord[], live: readonly RankRunRecord[]) {
  const liveById = new Map(live.map((run) => [run.id, run]));
  return current.map((run) => {
    const update = liveById.get(run.id);
    return update ? { ...run, ...update } : run;
  });
}

function realtimeRuns(operations: ReturnType<typeof useAppRealtime>["operations"]) {
  return operations.flatMap((operation) =>
    operation.kind === "rank_check"
      ? [{ ...operation, launchedAt: operation.startedAt } satisfies RankRunRecord]
      : [],
  );
}

async function fetchRunPage(projectRef: string, segment: RunsSegment, cursor?: string | null) {
  const params = new URLSearchParams({ limit: "20", project: projectRef, segment });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/rank-check-runs?${params.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Runs could not be loaded.");
  const parsed = rankRunListSchema.parse(await response.json());
  return { data: parsed.data, nextCursor: parsed.meta.next_cursor } satisfies RankRunPage;
}

async function postRunAction(projectRef: string, runId: string, action: "run-now" | "skip") {
  const response = await fetch(`/api/rank-check-runs/${runId}/${action}`, {
    body: JSON.stringify({ projectId: projectRef }),
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("The run could not be updated.");
  return rankRunMutationSchema.parse(await response.json()).data;
}

export function RunsSection({
  budgetExhausted = false,
  budgetSettingsHref,
  initialHistory,
  initialPlanned,
  initialSegment = "history",
  notices = [],
  projectRef,
  schedulesHref,
}: Readonly<RunsSectionProps>) {
  const t = useTranslations("projectRuns.rankRuns");
  const { operations } = useAppRealtime();
  const [segment, setSegment] = useState<RunsSegment>(initialSegment);
  const [history, setHistory] = useState(initialHistory.data);
  const [historyCursor, setHistoryCursor] = useState(initialHistory.nextCursor);
  const [planned, setPlanned] = useState(initialPlanned.data);
  const [plannedCursor, setPlannedCursor] = useState(initialPlanned.nextCursor);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [newRunIds, setNewRunIds] = useState<string[]>([]);
  const activeRunIds = useRef<string[]>([]);
  const realtime = useMemo(() => realtimeRuns(operations), [operations]);
  const historyRows = useMemo(() => mergeLiveRuns(history, realtime), [history, realtime]);
  const visibleRows = segment === "history" ? historyRows : planned;
  const cursor = segment === "history" ? historyCursor : plannedCursor;

  // Synchronize persisted History rows when the external realtime snapshot adds or drains a run.
  useEffect(() => {
    const currentIds = realtime.map((run) => run.id);
    const previousIds = activeRunIds.current;
    const addedIds = currentIds.filter((id) => !previousIds.includes(id));
    const exitedIds = previousIds.filter((id) => !currentIds.includes(id));
    activeRunIds.current = currentIds;

    const historicalIds = new Set(history.map((run) => run.id));
    const newIds = addedIds.filter((id) => !historicalIds.has(id));
    if (newIds.length > 0) {
      setNewRunIds((current) => [...new Set([...current, ...newIds])]);
    }
    if (exitedIds.length === 0) return;

    void fetchRunPage(projectRef, "history")
      .then((page) => {
        setHistory((current) => prependFreshRuns(current, page.data));
        setHistoryCursor(page.nextCursor);
      })
      .catch(() => setError(t("runsRefreshFailed")));
  }, [history, projectRef, realtime, t]);

  function loadMore() {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      try {
        const page = await fetchRunPage(projectRef, segment, cursor);
        if (segment === "history") {
          setHistory((current) => appendRuns(current, page.data));
          setHistoryCursor(page.nextCursor);
        } else {
          setPlanned((current) => appendRuns(current, page.data));
          setPlannedCursor(page.nextCursor);
        }
      } catch {
        setError(t("runsCouldNotLoad"));
      }
    });
  }

  function showNewRuns() {
    setError(null);
    startTransition(async () => {
      try {
        const page = await fetchRunPage(projectRef, "history");
        setHistory((current) => prependFreshRuns(current, page.data));
        setHistoryCursor(page.nextCursor);
        setNewRunIds([]);
      } catch {
        setError(t("runsCouldNotLoad"));
      }
    });
  }

  function updatePlannedRun(run: RankRunRecord, action: "run-now" | "skip") {
    setError(null);
    setPendingRunId(run.id);
    startTransition(async () => {
      try {
        const updated = await postRunAction(projectRef, run.id, action);
        setPlanned((current) => current.filter((item) => item.id !== run.id));
        if (updated.launchedAt || isSkippedOccurrence(updated)) {
          setHistory((current) => prependFreshRuns(current, [updated]));
        }
      } catch {
        setError(t("updateFailed"));
      } finally {
        setPendingRunId(null);
      }
    });
  }

  return (
    <section
      className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev"
      aria-labelledby="runs-title"
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="m-0 text-[15px] font-semibold leading-[1.35] text-fg" id="runs-title">
            {t("runs")}
          </h2>
          <p className="m-0 text-[10px] leading-[1.45] text-fg-muted">
            {segment === "planned" ? t("nextSevenDays") : t("newestFirst")}
          </p>
        </div>
        <SegmentedControl
          ariaLabel={t("runs")}
          fitContent
          onChange={setSegment}
          options={[
            { label: t("planned"), value: "planned" },
            { label: t("history"), value: "history" },
          ]}
          size="toolbar"
          value={segment}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 pb-2">
        <span className="text-[11px] text-fg-muted">
          {cursor
            ? t("showingMore", { count: visibleRows.length })
            : segment === "planned"
              ? planned.length > 0
                ? t("plannedRunCount", { count: planned.length })
                : null
              : t("runCount", { count: historyRows.length })}
        </span>
        {segment === "planned" ? (
          <Button href={schedulesHref} size="sm" variant="secondary">
            {t("manageSchedules")}
          </Button>
        ) : null}
      </div>
      <BudgetNotices notices={notices} />
      {error ? (
        <p className="m-0 px-4 pb-3 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      {segment === "planned" ? (
        <PlannedSection
          budgetExhausted={budgetExhausted}
          budgetSettingsHref={budgetSettingsHref}
          onRunNow={(run) => updatePlannedRun(run, "run-now")}
          onSkip={(run) => updatePlannedRun(run, "skip")}
          pendingRunId={pendingRunId}
          runs={planned}
        />
      ) : (
        <>
          {newRunIds.length > 0 ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2.5 border-y border-border px-4 py-2.5"
              data-new-runs-pill
              data-testid="new-runs-pill"
            >
              <span className="text-[12.5px] text-fg">
                {t("newRunsWhileReading", { count: newRunIds.length })}
              </span>
              <Button loading={isPending} onClick={showNewRuns} size="xs" variant="ghost">
                {t("show")}
              </Button>
            </div>
          ) : null}
          <RunsTable emptyActionHref={schedulesHref} projectRef={projectRef} rows={historyRows} />
        </>
      )}
      {cursor ? (
        <div className="flex justify-end px-4 py-3">
          <Button
            disabled={isPending}
            loading={isPending}
            onClick={loadMore}
            size="sm"
            variant="secondary"
          >
            {t("loadTwentyMore")}
          </Button>
        </div>
      ) : null}
      {visibleRows.length === 0 && segment === "planned" ? (
        <p className="m-0 border-t border-border px-4 py-3 text-[11.5px] text-fg-muted">
          {t("noScheduledRuns")}
        </p>
      ) : null}
    </section>
  );
}
