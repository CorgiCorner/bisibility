"use client";

import { useDateDisplay, useDateFormat } from "@/components/dates/DateFormatProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import {
  resolveSearchBackfillPresentation,
  type SearchSyncControlFacts,
  selectSearchImportCoverage,
} from "@/lib/search-insights/sync/control-model";
import { cn } from "@/lib/ui/cn";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useTranslations } from "next-intl";
import { SearchInsightsRefresh } from "./SearchInsightsRefresh";
import { progressWidthClass } from "./search-insights-import-progress";
import { formatSearchSyncCalendarDay, presentSearchSync } from "./search-sync-presentation";

const LABEL = "font-sans tabular-nums text-ui-micro uppercase tracking-wide text-fg-muted";
const FACT = "text-ui-body text-fg";

type WaitingStripProps = {
  deploymentMode: "cloud" | "self-host";
  facts: ImportObservabilityFacts | null;
  importState: SearchInsightsImportState | null;
  pauseAction?: SearchInsightsImportAction;
  projectId?: string;
  resumeAction?: SearchInsightsImportAction;
  statusFacts?: SearchSyncControlFacts;
  workerStatus: WorkerTemporalStatus;
};

function factsForWaitingStrip({
  facts,
  importState,
  statusFacts,
  workerStatus,
}: WaitingStripProps) {
  return {
    ...statusFacts,
    observability: facts ?? statusFacts?.observability,
    pauseStartedAt: importState?.pauseStartedAt ?? null,
    pausedReason: importState?.pausedReason ?? null,
    runtime: { workerStatus },
    safeError: importState?.safeError ?? null,
    state: importState?.state ?? null,
  } satisfies SearchSyncControlFacts;
}

/**
 * The early Search Console view shares the operations snapshot selector. It intentionally does
 * not offer a mutation because this surface has no frozen import id and property to authorize.
 */
export function SearchInsightsWaitingStrip(props: Readonly<WaitingStripProps>) {
  const dateFormat = useDateFormat();
  const dateDisplay = useDateDisplay();
  const t = useTranslations("projectSearchInsights.copy");
  const facts = factsForWaitingStrip(props);
  const model = resolveSearchBackfillPresentation(facts, dateFormat);
  const localizedModel = presentSearchSync(model, t, (value) =>
    formatSearchSyncCalendarDay(value, dateDisplay),
  );
  const coverage = selectSearchImportCoverage(facts);
  const hasCoverage = coverage.completed !== null && coverage.total !== null && coverage.total > 0;
  const coverageLabel = hasCoverage
    ? t("syncCoverageDays", { completed: coverage.completed, total: coverage.total })
    : null;
  const coveragePercent =
    coverage.completed !== null && coverage.total !== null && coverage.total > 0
      ? Math.round((coverage.completed / coverage.total) * 100)
      : 0;
  const canRefresh =
    model.kind === "queued" ||
    model.kind === "running" ||
    model.kind === "status_unavailable" ||
    model.kind === "waiting_worker";
  const showProgress =
    model.kind === "running" && hasCoverage && coverage.completed !== coverage.total;

  return (
    <section
      aria-label={t("dataProvenanceAria")}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-bg-elev px-4 py-3"
    >
      <span className={LABEL}>{t("trustFreshness")}</span>
      {showProgress ? (
        <span
          className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-bg-inset"
          data-startup-segment="progress"
        >
          <span className={cn("block h-full bg-fg-muted", progressWidthClass(coveragePercent))} />
        </span>
      ) : null}
      <span className={FACT} data-startup-segment="fact">
        <span data-startup-segment="status">{localizedModel.status}</span>
        {coverageLabel ? ` · ${coverageLabel}` : ""}
      </span>
      {localizedModel.supportingText ? (
        <Tooltip content={localizedModel.supportingText} semantics="description">
          <span className="inline-flex" data-startup-segment="detail">
            <Info aria-hidden className="shrink-0 text-fg-muted" size={13} weight="regular" />
          </span>
        </Tooltip>
      ) : null}
      {canRefresh ? <SearchInsightsRefresh active={model.kind === "running"} /> : null}
    </section>
  );
}
