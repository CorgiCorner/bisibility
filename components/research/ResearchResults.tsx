"use client";

import type { StoredResultFreshness } from "@/components/demo-research/StoredResultFreshness";
import type { TrackingConfigurationValue } from "@/components/keywords/add/TrackingConfigurationFields";
import { type GroupedResearchRow, groupResearchRows } from "@/lib/keyword-research/grouping";
import type {
  KeywordResearchSource,
  KeywordResearchSourceDiagnostic,
  KeywordResearchSuccess,
} from "@/lib/keyword-research/types";
import {
  activeResearchFilterCount,
  applyResearchFilters,
  emptyResearchFilters,
} from "@/lib/keyword-research/view-model";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ResearchDetailPanel } from "./ResearchDetailPanel";
import { ResearchFiltersDrawer } from "./ResearchFiltersDrawer";
import { ResearchResultsTable } from "./ResearchResultsTable";
import { DiagnosticsBanner, skipNote, warningLabel } from "./research-diagnostics";
import { deeperResearchCostCents } from "./research-results-model";
import { rowsForResearchScope } from "./research-scope-capability";
import type { ResearchAddDraft, ResearchSaveDraft } from "./research-workspace-model";

type ResearchResultsProps = {
  costContext?: ProjectCostContext;
  defaultTracking?: TrackingConfigurationValue;
  deeperEstimate?: { cached: boolean; costCents: number };
  onAdd?: (draft: ResearchAddDraft) => void;
  onDeeper?: () => void;
  onRemoveSaved?: (draft: ResearchSaveDraft) => void;
  onSave?: (draft: ResearchSaveDraft) => void;
  metricsAvailable?: boolean;
  projectId?: string;
  readOnly?: boolean;
  requestedLimit: number;
  result: Pick<KeywordResearchSuccess, "cached" | "fetchedAt" | "rows" | "sources"> &
    Partial<Pick<KeywordResearchSuccess, "connections">>;
  seed: string;
  storedFreshness?: StoredResultFreshness;
  trackingMarketCount?: number;
};
function isInfoSkip(source: KeywordResearchSourceDiagnostic) {
  return (
    source.status === "skipped" &&
    (source.reason === "cost_limit" || source.reason === "result_limit")
  );
}

export function ResearchResults({
  costContext,
  defaultTracking,
  deeperEstimate,
  onAdd,
  onDeeper,
  onRemoveSaved,
  onSave,
  metricsAvailable = true,
  projectId,
  readOnly = false,
  requestedLimit,
  result,
  seed,
  storedFreshness,
  trackingMarketCount = 1,
}: Readonly<ResearchResultsProps>) {
  const t = useTranslations("projectResearch.diagnostics");
  const format = useFormatter();
  const sourceLabels: Record<KeywordResearchSource, string> = {
    idea: t("ideas"),
    related: t("related"),
    suggestion: t("suggestions"),
  };
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [filters, setFilters] = useState(emptyResearchFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const grouped = useMemo(
    () => groupResearchRows(rowsForResearchScope(result.rows, metricsAvailable)),
    [metricsAvailable, result.rows],
  );
  const rows = useMemo(() => applyResearchFilters(grouped, filters), [filters, grouped]);
  const active = grouped.find((row) => row.keyword === activeKeyword) ?? null;
  const infoSkips = result.sources.filter(isInfoSkip);
  const warnings = result.sources.filter(
    (source) => source.status !== "ok" && (readOnly || !isInfoSkip(source)),
  );
  const okLabels = result.sources
    .filter((source) => source.status === "ok" && source.returned > 0)
    .map((source) => sourceLabels[source.source]);
  const skipNotes = (["result_limit", "cost_limit"] as const).flatMap((reason) => {
    const skipped = infoSkips.filter((source) => source.reason === reason);
    if (skipped.length === 0) return [];
    return [
      skipNote({
        format,
        okLabels,
        reason,
        resultCount: reason === "result_limit" ? requestedLimit : result.rows.length,
        skippedLabels: skipped.map((source) => sourceLabels[source.source]),
        t,
      }),
    ];
  });
  const isDismissed = (tone: "note" | "warning") =>
    dismissed.includes(`${result.fetchedAt}:${tone}`);
  const dismiss = (tone: "note" | "warning") =>
    setDismissed((previous) => [...previous, `${result.fetchedAt}:${tone}`]);
  const intentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of grouped) {
      const intent = row.intent ?? "unknown";
      counts[intent] = (counts[intent] ?? 0) + 1;
    }
    return counts;
  }, [grouped]);
  const nextLimit = requestedLimit === 100 ? 300 : 500;
  const deeper =
    !readOnly && result.rows.length === requestedLimit && requestedLimit < 500
      ? {
          cached: deeperEstimate?.cached ?? false,
          costCents: deeperResearchCostCents(
            { connections: result.connections ?? [], sources: result.sources },
            nextLimit,
            deeperEstimate,
          ),
          nextLimit,
        }
      : null;
  const saveDraft = (saveRows: GroupedResearchRow[]): ResearchSaveDraft | null =>
    defaultTracking
      ? {
          location: defaultTracking.location.canonicalKey,
          rows: saveRows,
          sourceSeed: seed,
        }
      : null;

  return (
    <section className="grid gap-3">
      {warnings.length > 0 && !isDismissed("warning") ? (
        <DiagnosticsBanner
          dismissLabel={t("dismiss")}
          onDismiss={() => dismiss("warning")}
          tone="warning"
        >
          {warnings.map((source) => (
            <span key={source.source}>{warningLabel(source, sourceLabels, t)}</span>
          ))}
        </DiagnosticsBanner>
      ) : null}
      {!readOnly && skipNotes.length > 0 && !isDismissed("note") ? (
        <DiagnosticsBanner
          dismissLabel={t("dismiss")}
          onDismiss={() => dismiss("note")}
          tone="note"
        >
          {skipNotes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </DiagnosticsBanner>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <ResearchResultsTable
          activeKeyword={activeKeyword}
          cached={result.cached}
          canRemoveSaved={Boolean(onRemoveSaved)}
          deeper={deeper}
          fetchedAt={result.fetchedAt}
          fetchedCount={result.rows.length}
          filterCount={activeResearchFilterCount(filters)}
          metricsAvailable={metricsAvailable}
          onActiveChange={(row) => setActiveKeyword(row.keyword)}
          onAddSelected={
            !readOnly && defaultTracking && onAdd
              ? () => onAdd({ ...defaultTracking, keywords: selectedKeywords })
              : undefined
          }
          onDeeper={onDeeper}
          onOpenFilters={() => setFiltersOpen(true)}
          onSaveSelected={
            readOnly
              ? undefined
              : (saveRows) => {
                  const draft = saveDraft(saveRows);
                  if (draft) onSave?.(draft);
                }
          }
          onSelectionChange={readOnly ? undefined : setSelectedKeywords}
          onToggleSave={
            readOnly
              ? undefined
              : (row) => {
                  const draft = saveDraft([row]);
                  if (!draft) return;
                  row.alreadySaved ? onRemoveSaved?.(draft) : onSave?.(draft);
                }
          }
          readOnly={readOnly}
          rows={rows}
          seed={seed}
          selectedKeywords={selectedKeywords}
          totalCount={result.rows.length}
          storedFreshness={storedFreshness}
          trackingMarketCount={trackingMarketCount}
        />
        <ResearchDetailPanel
          active={active}
          costContext={costContext}
          defaultTracking={defaultTracking}
          metricsAvailable={metricsAvailable}
          onAdd={onAdd}
          onSave={
            readOnly || !onSave
              ? undefined
              : (row) => {
                  const draft = saveDraft([row]);
                  if (draft) onSave(draft);
                }
          }
          projectId={projectId}
          readOnly={readOnly}
          seed={seed}
          trackingMarketCount={trackingMarketCount}
        />
      </div>
      {!metricsAvailable ? (
        <p className="m-0 flex items-start gap-2 text-[12.5px] leading-5 text-fg-muted">
          <Info weight="regular" aria-hidden className="mt-0.5 shrink-0" size={14} />
          {t("unavailableTooltip")}
        </p>
      ) : null}
      <ResearchFiltersDrawer
        filters={filters}
        intentCounts={intentCounts}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
        open={filtersOpen}
        resultCount={rows.length}
      />
    </section>
  );
}
