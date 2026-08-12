"use client";

import { CheckRunsSection } from "@/components/checks/runs/CheckRunsSection";
import { BudgetForecastNote } from "@/components/checks/upcoming/BudgetForecastNote";
import { UpcomingSection } from "@/components/checks/upcoming/UpcomingSection";
import { Card } from "@/components/ui";
import { loadCheckRuns } from "@/lib/actions/checks";
import type {
  CheckRange,
  CheckRunFilter,
  CheckRunProviderOption,
  CheckRunsCursor,
  CheckRunsView,
  CheckRunTriggerFilter,
  UpcomingView,
} from "@/lib/checks/contract";
import { checkedAtEndForDate, zonedDateInputValue } from "@/lib/checks/date-boundary";
import { appPath } from "@/lib/routing/app-path";
import { useMemo, useRef, useState, useTransition } from "react";
import { useUpcomingDisplayMode } from "./use-upcoming-display-mode";

export type ChecksWorkspaceProps = {
  initialRuns: CheckRunsView;
  now: string;
  projectId: string;
  projectRef: string;
  providerOptions: readonly CheckRunProviderOption[];
  upcoming: UpcomingView;
};

function runsLinks(projectRef: string) {
  return {
    connectProviderHref: appPath(projectRef, "integrations"),
    reorderProvidersHref: appPath(projectRef, "integrations"),
    reviewProvidersHref: appPath(projectRef, "integrations"),
    timelineHref: appPath(projectRef, "timeline"),
  };
}

function upcomingLinks(projectRef: string) {
  return {
    providerSettingsHref: appPath(projectRef, "integrations"),
    schedulesHref: appPath(projectRef, "rank-tracker"),
    timelineHref: appPath(projectRef, "timeline"),
  };
}

type RunsRequest = {
  cursor?: Exclude<CheckRunsCursor, null>;
  endAt?: string;
  filter: CheckRunFilter;
  provider: string;
  range: CheckRange;
  trigger: CheckRunTriggerFilter;
};

export function ChecksWorkspace({
  initialRuns,
  now,
  projectId,
  projectRef,
  providerOptions,
  upcoming,
}: Readonly<ChecksWorkspaceProps>) {
  const mode = useUpcomingDisplayMode();
  const nowDate = useMemo(() => new Date(now), [now]);
  const [filter, setFilter] = useState<CheckRunFilter>("all");
  const [provider, setProvider] = useState("all");
  const [range, setRange] = useState<CheckRange>("7d");
  const [customAsOfDate, setCustomAsOfDate] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<CheckRunTriggerFilter>("all");
  const [view, setView] = useState(initialRuns);
  const [cursor, setCursor] = useState(initialRuns.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const currentAsOfDate = zonedDateInputValue(nowDate, upcoming.timeZone);
  const asOfDate = customAsOfDate ?? currentAsOfDate;
  const customEndAt = customAsOfDate
    ? checkedAtEndForDate(customAsOfDate, upcoming.timeZone)
    : undefined;

  function requestRuns(request: RunsRequest, append: boolean) {
    if (append && loadingRef.current) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    loadingRef.current = true;
    setError(null);

    startTransition(async () => {
      try {
        const next = await loadCheckRuns({
          cursor: request.cursor,
          ...(request.endAt ? { endAt: request.endAt } : {}),
          filter: request.filter,
          projectId,
          provider: request.provider,
          range: request.range,
          trigger: request.trigger,
        });
        if (requestIdRef.current !== requestId) return;
        setView((current) => (append ? { ...next, rows: [...current.rows, ...next.rows] } : next));
        setCursor(next.nextCursor);
      } catch {
        if (requestIdRef.current === requestId) {
          setError("Checks could not be refreshed. Try again.");
        }
      } finally {
        if (requestIdRef.current === requestId) loadingRef.current = false;
      }
    });
  }

  function changeFilter(next: CheckRunFilter) {
    if (next === filter) return;
    setFilter(next);
    setCursor(null);
    requestRuns({ endAt: customEndAt, filter: next, provider, range, trigger }, false);
  }

  function changeRange(next: CheckRange) {
    if (next === range) return;
    setRange(next);
    setCursor(null);
    requestRuns({ endAt: customEndAt, filter, provider, range: next, trigger }, false);
  }

  function changeProvider(next: string) {
    if (next === provider) return;
    setProvider(next);
    setCursor(null);
    requestRuns({ endAt: customEndAt, filter, provider: next, range, trigger }, false);
  }

  function changeTrigger(next: CheckRunTriggerFilter) {
    if (next === trigger) return;
    setTrigger(next);
    setCursor(null);
    requestRuns({ endAt: customEndAt, filter, provider, range, trigger: next }, false);
  }

  function changeAsOfDate(date: string) {
    const isCurrentDay = date === currentAsOfDate;
    const endAt = isCurrentDay ? undefined : checkedAtEndForDate(date, upcoming.timeZone);
    setCustomAsOfDate(isCurrentDay ? null : date);
    setCursor(null);
    requestRuns({ endAt, filter, provider, range, trigger }, false);
  }

  function loadMore() {
    if (!cursor) return;
    requestRuns({ cursor, endAt: customEndAt, filter, provider, range, trigger }, true);
  }

  const runs = (
    <CheckRunsSection
      {...runsLinks(projectRef)}
      asOfDate={asOfDate}
      filter={filter}
      keywordHref={(keywordPublicId) => appPath(projectRef, "rank-tracker", keywordPublicId)}
      now={nowDate}
      onAsOfDateChange={changeAsOfDate}
      onFilterChange={changeFilter}
      onLoadMore={loadMore}
      onProviderChange={changeProvider}
      onRangeChange={changeRange}
      onTriggerChange={changeTrigger}
      provider={provider}
      providerOptions={providerOptions}
      range={range}
      timeZone={upcoming.timeZone}
      trigger={trigger}
      view={view}
    />
  );
  const upcomingSection = (
    <UpcomingSection
      {...upcomingLinks(projectRef)}
      mode={mode}
      now={nowDate}
      timeZone={upcoming.timeZone}
      view={upcoming}
    />
  );
  const errorMessage = error ? (
    <p
      className="m-0 rounded-xl border border-red/30 bg-red/8 px-3.5 py-3 text-sm text-red-text"
      role="alert"
    >
      {error}
    </p>
  ) : null;

  if (mode === "rail") {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_360px] items-start gap-5">
        <div className="min-w-0 space-y-3">
          {errorMessage}
          {runs}
        </div>
        {upcomingSection}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {mode === "strip" && upcoming.forecast ? (
        <Card className="px-4 py-3" size="md">
          <BudgetForecastNote forecast={upcoming.forecast} />
        </Card>
      ) : null}
      {upcomingSection}
      {errorMessage}
      {runs}
    </div>
  );
}
