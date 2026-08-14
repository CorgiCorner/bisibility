"use client";

import { Card } from "@/components/ui";
import type {
  CheckRange,
  CheckRunFilter,
  CheckRunProviderOption,
  CheckRunsView,
  CheckRunTriggerFilter,
} from "@/lib/checks/contract";
import { zonedDateInputValue } from "@/lib/checks/date-boundary";
import { useState } from "react";
import { CheckRunFilters, CheckRunStats, CheckRunsHeader } from "./CheckRunsControls";
import { ProviderHealth, RateLimitBanner } from "./CheckRunsProviderHealth";
import { type CheckRunsBudget, CheckRunsStatusBands } from "./CheckRunsStatusBands";
import { CheckRunsTable } from "./CheckRunsTable";
import { type SkippedRunsLinks, SkippedRunsView } from "./SkippedRunsView";

export type CheckRunsSectionProps = SkippedRunsLinks & {
  asOfDate: string;
  budget: CheckRunsBudget;
  budgetSettingsHref: string;
  filter: CheckRunFilter;
  initialExpandedRunIds?: readonly string[];
  keywordHref: (keywordPublicId: string) => string;
  now?: Date;
  onAsOfDateChange: (date: string) => void;
  onFilterChange: (filter: CheckRunFilter) => void;
  onLoadMore: () => void;
  onProviderChange: (provider: string) => void;
  onRangeChange: (range: CheckRange) => void;
  onRetryFailed?: () => void;
  onRetryStale?: () => void;
  onTriggerChange: (trigger: CheckRunTriggerFilter) => void;
  provider: string;
  providerOptions: readonly CheckRunProviderOption[];
  range: CheckRange;
  reorderProvidersHref: string;
  timeZone: string;
  trigger: CheckRunTriggerFilter;
  view: CheckRunsView;
};

export function CheckRunsSection({
  asOfDate,
  budget,
  budgetSettingsHref,
  connectProviderHref,
  filter,
  initialExpandedRunIds = [],
  keywordHref,
  now = new Date(),
  onAsOfDateChange,
  onFilterChange,
  onLoadMore,
  onProviderChange,
  onRangeChange,
  onRetryFailed,
  onRetryStale,
  onTriggerChange,
  provider,
  providerOptions,
  range,
  reorderProvidersHref,
  reviewProvidersHref,
  timeZone,
  timelineHref,
  trigger,
  view,
}: Readonly<CheckRunsSectionProps>) {
  const [expandedRunIds, setExpandedRunIds] = useState(() => new Set(initialExpandedRunIds));

  function toggleRun(runId: string) {
    setExpandedRunIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="md">
      <section aria-labelledby="check-runs-title">
        <CheckRunsHeader
          asOfDate={asOfDate}
          now={now}
          onAsOfDateChange={onAsOfDateChange}
          onProviderChange={onProviderChange}
          onRangeChange={onRangeChange}
          onTriggerChange={onTriggerChange}
          provider={provider}
          providerOptions={providerOptions}
          range={range}
          timeZone={timeZone}
          trigger={trigger}
        />
        <CheckRunStats counts={view.counts} filter={filter} onFilterChange={onFilterChange} />
        <CheckRunsStatusBands
          budget={budget}
          budgetSettingsHref={budgetSettingsHref}
          now={now}
          onRetryFailed={onRetryFailed}
          onRetryStale={onRetryStale}
          showStale={
            asOfDate === zonedDateInputValue(now, timeZone) &&
            filter === "all" &&
            provider === "all" &&
            trigger === "all"
          }
          timeZone={timeZone}
          view={view}
        />
        <RateLimitBanner onFilterChange={onFilterChange} range={range} view={view} />
        <ProviderHealth
          onFilterChange={onFilterChange}
          range={range}
          reorderProvidersHref={reorderProvidersHref}
          view={view}
        />
        <CheckRunFilters counts={view.counts} filter={filter} onFilterChange={onFilterChange} />
        {filter === "deferred" ? (
          <SkippedRunsView
            groups={view.deferredGroups}
            links={{ connectProviderHref, reviewProvidersHref, timelineHref }}
            now={now}
            range={range}
            timeZone={timeZone}
          />
        ) : (
          <CheckRunsTable
            expandedRunIds={expandedRunIds}
            filter={filter}
            keywordHref={keywordHref}
            now={now}
            onLoadMore={onLoadMore}
            onToggleRun={toggleRun}
            view={view}
          />
        )}
      </section>
    </Card>
  );
}
