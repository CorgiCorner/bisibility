"use client";

import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
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
  sortByClicks,
  toggleKey,
  topByClicksKeys,
} from "@/lib/keyword-suggest/top-query-selection";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useMemo, useState } from "react";
import type { SuggestionDrawerMessages } from "./keyword-suggestion-copy";
import { type SuggestionCostContext, suggestionCostLine } from "./keyword-suggestion-cost";

export type { SuggestionDrawerMessages } from "./keyword-suggestion-copy";
export type { SuggestionCostContext } from "./keyword-suggestion-cost";

type KeywordSuggestionDrawerProps = {
  costContext?: SuggestionCostContext;
  selectionOnly?: boolean;
  existingKeywords: readonly string[];
  hidden: readonly TopQuerySuggestion[];
  messages: SuggestionDrawerMessages;
  onClose: () => void;
  onConfirm: (queries: string[]) => void;
  open: boolean;
  suggestions: readonly TopQuerySuggestion[];
};

const FILTER_THRESHOLD = 25;
const metricCell = "w-16 shrink-0 text-right font-sans text-[11.5px] tabular-nums text-fg-muted";
const bulkButtonStyle = {
  "--control-color": "var(--fg-muted)",
  fontWeight: 400,
  minHeight: 30,
  paddingLeft: 10,
  paddingRight: 10,
};

function SuggestionRow({
  existingLabel,
  messages,
  onToggle,
  selected,
  suggestion,
}: Readonly<{
  existingLabel: string;
  messages: SuggestionDrawerMessages;
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
        <span className="shrink-0 rounded-full border border-border bg-bg-sunken px-2 py-0.5 font-sans tabular-nums text-[9.5px] uppercase tracking-[0.3px] text-fg-muted">
          {existingLabel}
        </span>
      ) : null}
      <span className={metricCell}>
        {suggestion.clicks == null
          ? messages.metricUnavailable
          : messages.metric({ value: suggestion.clicks })}
      </span>
      <span className={metricCell}>
        {suggestion.impressions == null
          ? messages.metricUnavailable
          : messages.metric({ value: suggestion.impressions })}
      </span>
    </label>
  );
}

export function KeywordSuggestionDrawer({
  costContext,
  selectionOnly = false,
  existingKeywords,
  hidden,
  messages,
  onClose,
  onConfirm,
  open,
  suggestions,
}: Readonly<KeywordSuggestionDrawerProps>) {
  const decorated = useMemo(
    () => sortByClicks(decorateSuggestions(suggestions, existingKeywords)),
    [suggestions, existingKeywords],
  );
  const decoratedHidden = useMemo(
    () => sortByClicks(decorateSuggestions(hidden, existingKeywords)),
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
      description={messages.description}
      footer={
        <div className="flex flex-col gap-2">
          <span className="font-sans tabular-nums text-[11.5px] text-fg-muted">
            {costContext
              ? suggestionCostLine(confirmed.length, costContext, messages)
              : messages.selected({ count: confirmed.length })}
          </span>
          <div className="flex items-center justify-end gap-2.5">
            <Button
              onClick={onClose}
              style={{ "--control-color": "var(--fg-muted)" }}
              type="button"
              variant="secondary"
            >
              {messages.cancel}
            </Button>
            <Button
              disabled={confirmed.length === 0}
              onClick={() => onConfirm(confirmed)}
              type="button"
              variant="primary"
            >
              {selectionOnly
                ? messages.use({ count: confirmed.length })
                : messages.add({ count: confirmed.length })}
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      title={messages.title}
    >
      <div className="flex flex-wrap items-center gap-2">
        {allSelected ? null : (
          <Button
            onClick={() => setSelected(new Set(selectable))}
            size="xs"
            style={bulkButtonStyle}
            type="button"
            variant="secondary"
          >
            {messages.selectAll}
          </Button>
        )}
        {hasSelection ? (
          <Button
            onClick={() => setSelected(new Set())}
            size="xs"
            style={bulkButtonStyle}
            type="button"
            variant="secondary"
          >
            {messages.clear}
          </Button>
        ) : null}
        <Button
          onClick={() => setSelected(new Set(topByClicksKeys(decorated, DEFAULT_PRESELECT_TOP_N)))}
          size="xs"
          style={bulkButtonStyle}
          type="button"
          variant="secondary"
        >
          {messages.top({ count: DEFAULT_PRESELECT_TOP_N })}
        </Button>
      </div>

      {decorated.length > FILTER_THRESHOLD ? (
        <label className="mt-3 flex items-center gap-2 rounded-control border border-border-control bg-transparent px-2.5 py-1.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid">
          <MagnifyingGlass
            weight="regular"
            aria-hidden
            className="shrink-0 text-fg-muted"
            size={14}
          />
          <input
            aria-label={messages.filterAria}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-[12px] placeholder:leading-4"
            onChange={(event) => setTerm(event.target.value)}
            placeholder={messages.filterPlaceholder}
            value={term}
          />
        </label>
      ) : null}

      <div className="mt-3 flex items-center gap-3 border-b border-border px-1 pb-1.5 font-sans tabular-nums text-[9.5px] uppercase tracking-[0.3px] text-fg-muted">
        <span className="w-4 shrink-0" />
        <span className="min-w-0 flex-1">{messages.query}</span>
        <span className="w-16 shrink-0 text-right">{messages.clicks}</span>
        <span className="w-16 shrink-0 text-right">{messages.impressions}</span>
      </div>
      <div className="mt-0" data-analytics-mask>
        {filtered.map((suggestion) => (
          <SuggestionRow
            existingLabel={selectionOnly ? messages.inDraft : messages.tracked}
            key={queryKey(suggestion.query)}
            messages={messages}
            onToggle={toggle}
            selected={selected.has(queryKey(suggestion.query))}
            suggestion={suggestion}
          />
        ))}
        {hiddenFiltered.map((suggestion) => (
          <SuggestionRow
            existingLabel={selectionOnly ? messages.inDraft : messages.tracked}
            key={`hidden-${queryKey(suggestion.query)}`}
            messages={messages}
            onToggle={toggle}
            selected={selected.has(queryKey(suggestion.query))}
            suggestion={suggestion}
          />
        ))}
      </div>

      {hidden.length > 0 ? (
        <p className="m-0 mt-3 text-[12px] text-fg-muted">
          {messages.hidden({ count: hidden.length })}{" "}
          <button
            className="font-semibold text-accent-text hover:underline"
            onClick={() => setShowHidden((value) => !value)}
            type="button"
          >
            {showHidden ? messages.hide : messages.show}
          </button>
        </p>
      ) : null}
    </AppDrawer>
  );
}
