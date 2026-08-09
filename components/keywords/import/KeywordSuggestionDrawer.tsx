"use client";

import { AppDrawer, Button } from "@/components/ui";
import {
  formatEstimateCents,
  monthlyChecksFor,
  monthlyCostCentsFor,
} from "@/lib/cost-estimate/project-estimate";
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import {
  DEFAULT_PRESELECT_TOP_N,
  decorateSuggestions,
  filterSuggestions,
  isAllSelected,
  queryKey,
  type SelectableSuggestion,
  selectableKeys,
  selectedQueries,
  toggleKey,
  topByClicksKeys,
} from "@/lib/keyword-suggest/top-query-selection";
import type { SerpDepth } from "@/lib/serp/markets";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

export type SuggestionCostContext = {
  cronExpression?: string | null;
  depth: SerpDepth;
  deviceCount: number;
  frequency: RankCheckFrequency;
  locationCount: number;
  overrideCents: number | null;
  providerId: string | null;
};

type KeywordSuggestionDrawerProps = {
  costContext: SuggestionCostContext;
  existingKeywords: readonly string[];
  hidden: readonly TopQuerySuggestion[];
  onClose: () => void;
  onConfirm: (queries: string[]) => void;
  open: boolean;
  suggestions: readonly TopQuerySuggestion[];
};

const FILTER_THRESHOLD = 25;
const metricCell = "w-16 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-fg-muted";
const bulkButton =
  "rounded-md border border-border-strong bg-bg-elev px-2.5 py-1 text-[11.5px] font-medium text-fg-muted transition-colors hover:border-accent hover:text-accent-text";

function metric(value: number | undefined) {
  return value == null ? "-" : value.toLocaleString();
}

function costLine(count: number, context: SuggestionCostContext) {
  const volume = {
    cronExpression: context.cronExpression,
    depth: context.depth,
    deviceCount: context.deviceCount,
    frequency: context.frequency,
    keywordCount: count,
    locationCount: context.locationCount,
  };
  const checks = monthlyChecksFor(volume);
  if (checks == null) {
    return `+${count} ${count === 1 ? "keyword" : "keywords"}`;
  }
  const cost = monthlyCostCentsFor(volume, {
    overrideCents: context.overrideCents,
    providerId: context.providerId,
  });
  const suffix = cost == null ? "" : ` ~ ${formatEstimateCents(cost)}/mo`;
  return `+${count} ${count === 1 ? "keyword" : "keywords"} = +${checks.toLocaleString()} checks/mo${suffix}`;
}

function SuggestionRow({
  onToggle,
  selected,
  suggestion,
}: Readonly<{
  onToggle: (query: string) => void;
  selected: boolean;
  suggestion: SelectableSuggestion;
}>) {
  const disabled = suggestion.alreadyTracked;
  return (
    <label
      className={`flex items-center gap-3 border-b border-border px-1 py-2 text-[13px] ${
        disabled ? "cursor-not-allowed text-fg-muted" : "cursor-pointer"
      }`}
    >
      <input
        aria-label={suggestion.query}
        checked={selected && !disabled}
        className="size-4 shrink-0 accent-accent"
        disabled={disabled}
        onChange={() => onToggle(suggestion.query)}
        type="checkbox"
      />
      <span className="min-w-0 flex-1 truncate text-fg">{suggestion.query}</span>
      {disabled ? (
        <span className="shrink-0 rounded-full border border-border bg-bg-sunken px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.3px] text-fg-muted">
          Tracked
        </span>
      ) : null}
      <span className={metricCell}>{metric(suggestion.clicks)}</span>
      <span className={metricCell}>{metric(suggestion.impressions)}</span>
    </label>
  );
}

export function KeywordSuggestionDrawer({
  costContext,
  existingKeywords,
  hidden,
  onClose,
  onConfirm,
  open,
  suggestions,
}: Readonly<KeywordSuggestionDrawerProps>) {
  const decorated = useMemo(
    () => decorateSuggestions(suggestions, existingKeywords),
    [suggestions, existingKeywords],
  );
  const decoratedHidden = useMemo(
    () => decorateSuggestions(hidden, existingKeywords),
    [hidden, existingKeywords],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(topByClicksKeys(decorated, DEFAULT_PRESELECT_TOP_N)),
  );
  const [term, setTerm] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const confirmable = showHidden ? [...decorated, ...decoratedHidden] : decorated;
  const confirmed = selectedQueries(confirmable, selected);
  const filtered = filterSuggestions(decorated, term);
  const hiddenFiltered = showHidden ? filterSuggestions(decoratedHidden, term) : [];
  const selectable = selectableKeys(decorated);
  const allSelected = isAllSelected(decorated, selected);
  const hasSelection = selected.size > 0;

  function toggle(query: string) {
    setSelected((current) => toggleKey(current, query));
  }

  return (
    <AppDrawer
      description="Sanitized Search Console queries. Pick the ones to track."
      footer={
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11.5px] text-fg-muted">
            {costLine(confirmed.length, costContext)}
          </span>
          <div className="flex items-center justify-end gap-2.5">
            <Button
              onClick={onClose}
              sx={{ color: "var(--fg-muted)" }}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={confirmed.length === 0}
              onClick={() => onConfirm(confirmed)}
              type="button"
              variant="primary"
            >
              Add {confirmed.length} {confirmed.length === 1 ? "keyword" : "keywords"}
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      title="Import from Search Console"
    >
      <div className="flex flex-wrap items-center gap-2">
        {allSelected ? null : (
          <button
            className={bulkButton}
            onClick={() => setSelected(new Set(selectable))}
            type="button"
          >
            Select all
          </button>
        )}
        {hasSelection ? (
          <button className={bulkButton} onClick={() => setSelected(new Set())} type="button">
            Clear
          </button>
        ) : null}
        <button
          className={bulkButton}
          onClick={() => setSelected(new Set(topByClicksKeys(decorated, DEFAULT_PRESELECT_TOP_N)))}
          type="button"
        >
          Top {DEFAULT_PRESELECT_TOP_N} by clicks
        </button>
      </div>

      {decorated.length > FILTER_THRESHOLD ? (
        <label className="mt-3 flex items-center gap-2 rounded-[9px] border border-border-strong bg-transparent px-2.5 py-1.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid">
          <MagnifyingGlass aria-hidden className="shrink-0 text-fg-muted" size={14} />
          <input
            aria-label="Filter suggestions"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none"
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Filter queries"
            value={term}
          />
        </label>
      ) : null}

      <div className="mt-3 flex items-center gap-3 border-b border-border-strong px-1 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.3px] text-fg-muted">
        <span className="w-4 shrink-0" />
        <span className="min-w-0 flex-1">Query</span>
        <span className="w-16 shrink-0 text-right">Clicks</span>
        <span className="w-16 shrink-0 text-right">Impr.</span>
      </div>
      <div className="mt-0">
        {filtered.map((suggestion) => (
          <SuggestionRow
            key={queryKey(suggestion.query)}
            onToggle={toggle}
            selected={selected.has(queryKey(suggestion.query))}
            suggestion={suggestion}
          />
        ))}
        {hiddenFiltered.map((suggestion) => (
          <SuggestionRow
            key={`hidden-${queryKey(suggestion.query)}`}
            onToggle={toggle}
            selected={selected.has(queryKey(suggestion.query))}
            suggestion={suggestion}
          />
        ))}
      </div>

      {hidden.length > 0 ? (
        <p className="m-0 mt-3 text-[12px] text-fg-muted">
          {hidden.length} low-quality {hidden.length === 1 ? "query" : "queries"} hidden.{" "}
          <button
            className="font-semibold text-accent-text hover:underline"
            onClick={() => setShowHidden((value) => !value)}
            type="button"
          >
            {showHidden ? "Hide" : "Show anyway"}
          </button>
        </p>
      ) : null}
    </AppDrawer>
  );
}
