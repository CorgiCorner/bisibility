"use client";

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
import {
  InfoIcon as Info,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import { type ReactNode, useMemo, useState } from "react";
import { ResearchDetailPanel } from "./ResearchDetailPanel";
import { ResearchFiltersDrawer } from "./ResearchFiltersDrawer";
import { ResearchResultsTable } from "./ResearchResultsTable";
import { deeperResearchCostCents } from "./research-results-model";
import type { ResearchAddDraft, ResearchSaveDraft } from "./research-workspace-model";

type ResearchResultsProps = {
  costContext: ProjectCostContext;
  defaultTracking: TrackingConfigurationValue;
  deeperEstimate?: { cached: boolean; costCents: number };
  onAdd: (draft: ResearchAddDraft) => void;
  onDeeper: () => void;
  onRemoveSaved?: (draft: ResearchSaveDraft) => void;
  onSave?: (draft: ResearchSaveDraft) => void;
  projectId: string;
  requestedLimit: 100 | 300 | 500;
  result: KeywordResearchSuccess;
  seed: string;
};

const sourceLabels: Record<KeywordResearchSource, string> = {
  idea: "ideas",
  related: "related",
  suggestion: "suggestions",
};

function joinLabels(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function isInfoSkip(source: KeywordResearchSourceDiagnostic) {
  return (
    source.status === "skipped" &&
    (source.reason === "cost_limit" || source.reason === "result_limit")
  );
}

function skipNote(input: {
  okLabels: string[];
  reason: "cost_limit" | "result_limit";
  resultCount: number;
  skippedLabels: string[];
}) {
  const results = `${input.resultCount} ${input.resultCount === 1 ? "result" : "results"}`;
  const origin =
    input.okLabels.length > 0
      ? `Your ${results} came from ${joinLabels(input.okLabels)}`
      : `Your ${results} ${input.resultCount === 1 ? "was" : "were"} already covered`;
  const single = input.skippedLabels.length === 1;
  const subject = `the ${joinLabels(input.skippedLabels)} ${single ? "source" : "sources"}`;
  const outcome =
    input.reason === "result_limit"
      ? `${single ? "was" : "were"} not needed`
      : `${single ? "was" : "were"} skipped to stay within the cost cap`;
  return `${origin} - ${subject} ${outcome}, so ${single ? "it was" : "they were"} not charged.`;
}

function warningLabel(source: KeywordResearchSourceDiagnostic) {
  const reason = (source.reason ?? "provider_error").replaceAll("_", " ");
  const verb = source.status === "failed" ? "failed" : "was skipped";
  return `The ${sourceLabels[source.source]} source ${verb} (${reason}) - results may be incomplete.`;
}

function DiagnosticsBanner({
  children,
  onDismiss,
  tone,
}: Readonly<{ children: ReactNode; onDismiss: () => void; tone: "note" | "warning" }>) {
  const warning = tone === "warning";
  return (
    <div
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-[10px] border px-3 py-2 text-[11.5px] text-fg-muted ${
        warning ? "border-yellow/40 bg-yellow/10" : "border-border bg-bg-sunken"
      }`}
      data-testid="research-diagnostics-banner"
    >
      {warning ? (
        <WarningCircle className="shrink-0 text-yellow-strong" size={14} weight="fill" />
      ) : (
        <Info className="shrink-0 text-fg-faint" size={14} weight="fill" />
      )}
      <div
        className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 py-0.5 leading-[1.45]"
        data-testid="research-diagnostics-content"
      >
        {children}
      </div>
      <button
        aria-label="Dismiss"
        className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[7px] p-0 text-fg-faint hover:text-fg"
        onClick={onDismiss}
        type="button"
      >
        <X size={12} weight="bold" />
      </button>
    </div>
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
  projectId,
  requestedLimit,
  result,
  seed,
}: Readonly<ResearchResultsProps>) {
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [filters, setFilters] = useState(emptyResearchFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const grouped = useMemo(() => groupResearchRows(result.rows), [result.rows]);
  const rows = useMemo(() => applyResearchFilters(grouped, filters), [filters, grouped]);
  const active = grouped.find((row) => row.keyword === activeKeyword) ?? null;
  const infoSkips = result.sources.filter(isInfoSkip);
  const warnings = result.sources.filter((source) => source.status !== "ok" && !isInfoSkip(source));
  const okLabels = result.sources
    .filter((source) => source.status === "ok" && source.returned > 0)
    .map((source) => sourceLabels[source.source]);
  const skipNotes = (["result_limit", "cost_limit"] as const).flatMap((reason) => {
    const skipped = infoSkips.filter((source) => source.reason === reason);
    if (skipped.length === 0) return [];
    return [
      skipNote({
        okLabels,
        reason,
        resultCount: reason === "result_limit" ? requestedLimit : result.rows.length,
        skippedLabels: skipped.map((source) => sourceLabels[source.source]),
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
    result.rows.length === requestedLimit && requestedLimit < 500
      ? {
          cached: deeperEstimate?.cached ?? false,
          costCents: deeperResearchCostCents(result, nextLimit, deeperEstimate),
          nextLimit,
        }
      : null;
  const saveDraft = (saveRows: GroupedResearchRow[]): ResearchSaveDraft => ({
    location: defaultTracking.location.canonicalKey,
    rows: saveRows,
    sourceSeed: seed,
  });

  return (
    <section className="grid gap-3">
      {warnings.length > 0 && !isDismissed("warning") ? (
        <DiagnosticsBanner onDismiss={() => dismiss("warning")} tone="warning">
          {warnings.map((source) => (
            <span key={source.source}>{warningLabel(source)}</span>
          ))}
        </DiagnosticsBanner>
      ) : null}
      {skipNotes.length > 0 && !isDismissed("note") ? (
        <DiagnosticsBanner onDismiss={() => dismiss("note")} tone="note">
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
          costContext={costContext}
          deeper={deeper}
          fetchedAt={result.fetchedAt}
          fetchedCount={result.rows.length}
          filterCount={activeResearchFilterCount(filters)}
          onActiveChange={(row) => setActiveKeyword(row.keyword)}
          onAddSelected={() => onAdd({ ...defaultTracking, keywords: selectedKeywords })}
          onDeeper={onDeeper}
          onOpenFilters={() => setFiltersOpen(true)}
          onSaveSelected={(saveRows) => onSave?.(saveDraft(saveRows))}
          onSelectionChange={setSelectedKeywords}
          onToggleSave={(row) =>
            row.alreadySaved ? onRemoveSaved?.(saveDraft([row])) : onSave?.(saveDraft([row]))
          }
          rows={rows}
          seed={seed}
          selectedKeywords={selectedKeywords}
          totalCount={result.rows.length}
        />
        <ResearchDetailPanel
          active={active}
          costContext={costContext}
          defaultTracking={defaultTracking}
          onAdd={onAdd}
          onSave={onSave ? (row) => onSave(saveDraft([row])) : undefined}
          projectId={projectId}
          seed={seed}
        />
      </div>
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
