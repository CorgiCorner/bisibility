"use client";

import { LocationField } from "@/components/keywords/LocationField";
import {
  countryValueForCode,
  type LocationFieldValue,
} from "@/components/keywords/location-picker-data";
import { Button, ExternalLink, Input, MonoText, Tooltip } from "@/components/ui";
import { researchMetricsUnavailableNote } from "@/lib/serp/market-capability";
import { MARKETING_URL } from "@/lib/site/site";
import { CheckIcon as Check, MagnifyingGlassIcon as Search } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
import {
  additionalMarketLanguages,
  allMarketLanguages,
  defaultMarketLanguage,
  filterMarketLanguages,
  type MarketPickerChoice,
  marketChoice,
  recommendedMarketLanguages,
} from "./market-picker-model";

export type { MarketPickerChoice };

export type MarketPickerProps = {
  calculatorHref?: string | null;
  initialLocation?: LocationFieldValue;
  maxMarkets?: number;
  onCancel?: () => void;
  onCommit: (choices: readonly MarketPickerChoice[]) => Promise<void> | void;
  projectId: string;
  trackedCanonicalKeys: readonly string[];
};

type MarketLanguage = { code: string; label: string };

// The search row has a pinned height so the group headers can stick directly beneath it
// instead of guessing an offset that moves with the font. Keep the two in step.
const searchRowHeightClassName = "h-12";
const groupTopWithSearchClassName = "top-12";

function defaultLocation() {
  const location = countryValueForCode("US");
  if (!location) throw new Error("Default market location is missing.");
  return location;
}

function initialCodes(location: LocationFieldValue) {
  // The market default, not the first row: the groups sort alphabetically, so position
  // in the list says nothing about which language the country actually defaults to.
  return [defaultMarketLanguage(location).code];
}

export function MarketPicker({
  calculatorHref = null,
  initialLocation = defaultLocation(),
  maxMarkets,
  onCancel,
  onCommit,
  projectId,
  trackedCanonicalKeys,
}: Readonly<MarketPickerProps>) {
  const listId = useId();
  const [location, setLocation] = useState(initialLocation);
  const [selectedCodes, setSelectedCodes] = useState(() => initialCodes(initialLocation));
  const [showMore, setShowMore] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const recommended = recommendedMarketLanguages(location);
  const suggestedShown = showMore ? filterMarketLanguages(recommended, languageQuery) : recommended;
  const additional = showMore ? additionalMarketLanguages(location, languageQuery) : [];
  const languages = useMemo(
    () => new Map(allMarketLanguages(location).map((language) => [language.code, language])),
    [location],
  );
  const tracked = new Set(trackedCanonicalKeys);
  const selected = selectedCodes.flatMap((code) => {
    const language = languages.get(code);
    return language ? [marketChoice(location, language)] : [];
  });
  const pending = selected.filter((choice) => !tracked.has(choice.canonicalKey));
  const offCatalog = pending.filter((choice) => !choice.researchAvailable);
  const remaining = maxMarkets === undefined ? Number.POSITIVE_INFINITY : maxMarkets - tracked.size;

  function changeLocation(next: LocationFieldValue) {
    setLocation(next);
    setSelectedCodes(initialCodes(next));
    setShowMore(false);
    setLanguageQuery("");
  }

  function toggleExpanded() {
    setShowMore((current) => !current);
    setLanguageQuery("");
  }

  function toggleLanguage(language: MarketLanguage) {
    const choice = marketChoice(location, language);
    if (tracked.has(choice.canonicalKey)) return;
    setSelectedCodes((current) => {
      if (current.includes(language.code)) return current.filter((code) => code !== language.code);
      const untrackedCount = current.filter((code) => {
        const item = languages.get(code);
        return item && !tracked.has(marketChoice(location, item).canonicalKey);
      }).length;
      return untrackedCount >= remaining ? current : [...current, language.code];
    });
  }

  async function commit() {
    if (pending.length === 0) return;
    setSubmitting(true);
    try {
      await onCommit(pending);
    } finally {
      setSubmitting(false);
    }
  }

  function languageRow(language: MarketLanguage) {
    const choice = marketChoice(location, language);
    const isTracked = tracked.has(choice.canonicalKey);
    const isSelected = selectedCodes.includes(language.code);
    const isDisabled = isTracked || submitting;
    const row = (
      <button
        aria-pressed={isSelected || isTracked}
        className={`flex min-h-10 w-full items-center gap-2 rounded-[9px] px-3 py-2 text-left transition-colors hover:bg-bg-sunken ${
          isSelected || isTracked ? "bg-accent-soft text-fg" : "text-fg-muted"
        }`}
        disabled={isDisabled}
        key={language.code}
        onClick={() => toggleLanguage(language)}
        type="button"
      >
        <span className="flex-1 truncate text-[13px] font-semibold">{language.label}</span>
        {choice.researchAvailable ? null : (
          // Terse on the row; the whole sentence is the row's description and the note
          // under the selection. Muted metadata, never an error treatment.
          <span className="shrink-0 font-mono text-[9.5px] tracking-[0.3px] text-fg-muted">
            no volume/KD
          </span>
        )}
        {isTracked ? <MonoText size="sm">TRACKED</MonoText> : null}
        {isSelected && !isTracked ? <Check aria-hidden size={15} weight="bold" /> : null}
      </button>
    );

    if (choice.researchAvailable) return row;

    // The tooltip wraps the row rather than the suffix: a span inside a button never takes
    // focus, so a suffix-anchored tooltip is reachable by pointer only. `semantics="description"`
    // keeps the sentence a description, so the row is still announced as its language plus
    // the short suffix rather than reading the whole sentence back as its name.
    // A disabled button emits no pointer or focus events, so a tracked row needs the
    // wrapper MUI documents; that row is not actionable anyway, so pointer-only is the
    // most the sentence can be there.
    return (
      <Tooltip
        semantics="description"
        key={language.code}
        content={researchMetricsUnavailableNote(language.label)}
      >
        {isDisabled ? <span className="block">{row}</span> : row}
      </Tooltip>
    );
  }

  function languageGroup(slug: string, title: string, items: readonly MarketLanguage[]) {
    if (items.length === 0) return null;
    const labelId = `${listId}-${slug}`;
    // A grouping element, not a styled div: the label has to reach assistive technology
    // too, or "suggested" is a fact only sighted users get.
    return (
      <fieldset aria-labelledby={labelId} className="m-0 min-w-0 border-0 p-0">
        <div
          className={`sticky z-10 bg-bg-elev px-3 pb-2 pt-2.5 ${
            showMore ? groupTopWithSearchClassName : "top-0"
          }`}
          id={labelId}
        >
          <MonoText component="span" muted size="sm">
            {title}
          </MonoText>
        </div>
        <div className="grid gap-1 px-1 pb-1">{items.map(languageRow)}</div>
      </fieldset>
    );
  }

  return (
    <section
      aria-label="Add markets"
      className="rounded-[12px] border border-border bg-bg-elev p-4"
    >
      <LocationField
        disabled={submitting}
        label="Location"
        onChange={changeLocation}
        projectId={projectId}
        value={location}
      />
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <MonoText component="span" muted size="sm">
            LANGUAGES
          </MonoText>
          <button
            aria-controls={listId}
            aria-expanded={showMore}
            className="inline-flex min-h-[26px] items-center rounded-[7px] border border-border bg-bg-elev px-2 text-[11.5px] font-semibold text-fg-muted outline-offset-2 transition-colors hover:border-border-strong hover:bg-bg-sunken hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
            onClick={toggleExpanded}
            type="button"
          >
            {showMore ? "Suggested only" : "More languages"}
          </button>
        </div>
        {/* Capped and scrolled here rather than by the host: the picker also renders inline,
            and the dialog must not grow past the viewport in either case. */}
        <fieldset
          aria-label="Languages"
          className="m-0 mt-2 max-h-[min(60vh,520px)] min-w-0 overflow-y-auto rounded-[10px] border border-border-soft p-0"
          id={listId}
        >
          {showMore ? (
            <div
              className={`sticky top-0 z-20 flex items-center gap-2 border-b border-border-soft bg-bg-elev px-2 ${searchRowHeightClassName}`}
            >
              <span className="relative flex flex-1 items-center">
                <Search aria-hidden className="absolute left-2.5 text-fg-muted" size={14} />
                <Input
                  aria-label="Search more languages"
                  className="pl-8"
                  onChange={(event) => setLanguageQuery(event.target.value)}
                  placeholder="Search all supported languages"
                  value={languageQuery}
                />
              </span>
            </div>
          ) : null}
          {languageGroup("suggested", "SUGGESTED LANGUAGES", suggestedShown)}
          {languageGroup("all", "ALL LANGUAGES", additional)}
          {suggestedShown.length + additional.length === 0 ? (
            <p className="m-0 px-3 py-4 text-[12.5px] text-fg-muted">
              No supported language matches that search.
            </p>
          ) : null}
        </fieldset>
        {offCatalog.map((choice) => (
          <p
            className="m-0 mt-2 text-[11.5px] leading-[1.5] text-fg-muted"
            key={choice.canonicalKey}
          >
            {researchMetricsUnavailableNote(choice.language.label)}
          </p>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
        <span className="text-[12px] text-fg-muted">
          {pending.length} {pending.length === 1 ? "market" : "markets"} selected
          {calculatorHref ? (
            <>
              {" / "}
              <ExternalLink
                className="text-accent-text hover:underline"
                href={`${MARKETING_URL}${calculatorHref}`}
              >
                Estimate provider cost
              </ExternalLink>
            </>
          ) : null}
        </span>
        <span className="flex gap-2">
          {onCancel ? (
            <Button disabled={submitting} onClick={onCancel} size="sm" variant="secondary">
              Cancel
            </Button>
          ) : null}
          <Button disabled={pending.length === 0} loading={submitting} onClick={commit} size="sm">
            Add {pending.length || "market"}
          </Button>
        </span>
      </div>
    </section>
  );
}
