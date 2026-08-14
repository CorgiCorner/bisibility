"use client";

import { LocationField } from "@/components/keywords/LocationField";
import {
  countryValueForCode,
  type LocationFieldValue,
} from "@/components/keywords/location-picker-data";
import { Button, Input, MonoText } from "@/components/ui";
import { CheckIcon as Check, MagnifyingGlassIcon as Search } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  additionalMarketLanguages,
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

const positionsOnlyCopy =
  "No search volume or difficulty data for this market - positions are tracked normally.";

function defaultLocation() {
  const location = countryValueForCode("US");
  if (!location) throw new Error("Default market location is missing.");
  return location;
}

function initialCodes(location: LocationFieldValue) {
  return recommendedMarketLanguages(location)
    .slice(0, 1)
    .map((language) => language.code);
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
  const [location, setLocation] = useState(initialLocation);
  const [selectedCodes, setSelectedCodes] = useState(() => initialCodes(initialLocation));
  const [showMore, setShowMore] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const recommended = recommendedMarketLanguages(location);
  const additional = additionalMarketLanguages(location, languageQuery);
  const languages = useMemo(
    () => new Map([...recommended, ...additional].map((language) => [language.code, language])),
    [additional, recommended],
  );
  const tracked = new Set(trackedCanonicalKeys);
  const selected = selectedCodes.flatMap((code) => {
    const language = languages.get(code);
    return language ? [marketChoice(location, language)] : [];
  });
  const pending = selected.filter((choice) => !tracked.has(choice.canonicalKey));
  const remaining = maxMarkets === undefined ? Number.POSITIVE_INFINITY : maxMarkets - tracked.size;

  function changeLocation(next: LocationFieldValue) {
    setLocation(next);
    setSelectedCodes(initialCodes(next));
    setShowMore(false);
    setLanguageQuery("");
  }

  function toggleLanguage(language: { code: string; label: string }) {
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

  function languageButton(language: { code: string; label: string }) {
    const choice = marketChoice(location, language);
    const isTracked = tracked.has(choice.canonicalKey);
    const selected = selectedCodes.includes(language.code);
    return (
      <button
        aria-pressed={selected || isTracked}
        className={`flex min-h-10 w-full items-center gap-3 rounded-[9px] px-3 py-2 text-left transition-colors hover:bg-bg-sunken ${
          selected || isTracked ? "bg-accent-soft text-fg" : "text-fg-muted"
        }`}
        disabled={isTracked || submitting}
        key={language.code}
        onClick={() => toggleLanguage(language)}
        type="button"
      >
        <span className="flex-1">
          <span className="block text-[13px] font-semibold">{language.label}</span>
          {!choice.researchAvailable ? (
            <span className="block text-[11px] text-fg-muted">{positionsOnlyCopy}</span>
          ) : null}
        </span>
        {isTracked ? <MonoText size="sm">TRACKED</MonoText> : null}
        {selected && !isTracked ? <Check aria-hidden size={15} weight="bold" /> : null}
      </button>
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
            SUGGESTED LANGUAGES
          </MonoText>
          <button
            className="text-[12px] font-semibold text-accent-text"
            onClick={() => setShowMore((current) => !current)}
            type="button"
          >
            {showMore ? "Suggested only" : "More languages"}
          </button>
        </div>
        {showMore ? (
          <span className="relative mt-2 flex items-center">
            <Search aria-hidden className="absolute left-2.5 text-fg-muted" size={14} />
            <Input
              aria-label="Search more languages"
              className="pl-8"
              onChange={(event) => setLanguageQuery(event.target.value)}
              placeholder="Search all supported languages"
              value={languageQuery}
            />
          </span>
        ) : null}
        <div className="mt-2 grid gap-1">
          {recommended.map(languageButton)}
          {showMore ? additional.slice(0, 20).map(languageButton) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
        <span className="text-[12px] text-fg-muted">
          {pending.length} {pending.length === 1 ? "market" : "markets"} selected
          {calculatorHref ? (
            <>
              {" / "}
              <a className="text-accent-text hover:underline" href={calculatorHref}>
                Estimate provider cost
              </a>
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
