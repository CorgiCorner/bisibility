"use client";

import { Card } from "@/components/ui/Card";
import { zonedDateInputValue } from "@/lib/checks/date-boundary";
import type { CheckRunsSectionProps } from "@/lib/checks/section-contract";
import { useState } from "react";
import { CheckRunFilters, CheckRunStats, CheckRunsHeader } from "./CheckRunsControls";
import { ProviderHealth, RateLimitBanner } from "./CheckRunsProviderHealth";
import { CheckRunsStatusBands } from "./CheckRunsStatusBands";
import { CheckRunsTable } from "./CheckRunsTable";
import { EvidenceProjectionBands } from "./EvidenceProjectionBands";
import { SkippedRunsView } from "./SkippedRunsView";

export type { CheckRunsSectionProps } from "@/lib/checks/section-contract";

export function CheckRunsSection({
  exactRange,
  hideAsOfDate,
  hideProvider,
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
          exactRange={exactRange}
          hideAsOfDate={hideAsOfDate}
          hideProvider={hideProvider}
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
            !exactRange &&
            asOfDate === zonedDateInputValue(now, timeZone) &&
            filter === "all" &&
            provider === "all" &&
            trigger === "all"
          }
          timeZone={timeZone}
          view={view}
        />
        {filter !== "deferred" ? (
          <EvidenceProjectionBands counts={view.evidenceCounts} onFilterChange={onFilterChange} />
        ) : null}
        <RateLimitBanner
          exactRange={exactRange}
          onFilterChange={onFilterChange}
          range={range}
          view={view}
        />
        <ProviderHealth
          exactRange={exactRange}
          onFilterChange={onFilterChange}
          range={range}
          reorderProvidersHref={reorderProvidersHref}
          view={view}
        />
        <CheckRunFilters counts={view.counts} filter={filter} onFilterChange={onFilterChange} />
        {filter === "deferred" ? (
          <SkippedRunsView
            exactRange={exactRange}
            groups={view.deferredGroups}
            evidenceCounts={view.evidenceCounts}
            onFilterChange={onFilterChange}
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
