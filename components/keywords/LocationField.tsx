"use client";

import { FieldLabel } from "@/components/ui";
import {
  GlobeHemisphereWestIcon as GlobeHemisphereWest,
  MapPinIcon as MapPin,
  XIcon as X,
} from "@phosphor-icons/react";
import { type FocusEvent, Fragment, useId, useState } from "react";
import { locationKeyHandler } from "./location-key-handler";
import {
  countryNameForCode,
  EMPTY_PROVIDER_HINT_LENGTH,
  type LocationFieldValue,
  type LocationSuggestion,
  useLocationSearch,
} from "./location-picker-data";

export type { LocationFieldValue };

type LocationFieldProps = {
  value: LocationFieldValue;
  onChange: (value: LocationFieldValue) => void;
  projectId?: string | null;
  error?: string;
  help?: string;
  idPrefix?: string;
  disabled?: boolean;
  label?: string;
  /** Keep the label for screen readers only - for compact single-row layouts. */
  labelHidden?: boolean;
  placeholder?: string;
  /** "form" is the drawer/form field look; "toolbar" matches the compact toolbar controls. */
  variant?: "form" | "toolbar";
};

const fieldClassByVariant = {
  form: "min-h-10 w-full rounded-[9px] border border-border-strong bg-bg-sunken px-9 text-[13px] font-medium text-fg outline-none focus:border-accent",
  toolbar:
    "min-h-[34px] w-full rounded-[9px] border border-border-strong bg-bg-elev px-9 text-[12.5px] font-medium text-fg outline-none focus:border-accent",
} as const;
const labelClass =
  "m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0 font-mono text-[10px] uppercase tracking-[0.4px] text-fg-faint";

function cityCaption(option: LocationSuggestion) {
  return [option.regionName, countryNameForCode(option.countryCode) ?? option.countryCode]
    .filter(Boolean)
    .join(", ");
}

function activeId(listId: string, option: LocationSuggestion | undefined) {
  return option ? `${listId}-${option.id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;
}

export function LocationField({
  value,
  onChange,
  projectId = null,
  error,
  help,
  idPrefix,
  disabled = false,
  label = "Location",
  labelHidden = false,
  placeholder = "Search country or city",
  variant = "form",
}: Readonly<LocationFieldProps>) {
  const fieldClass = fieldClassByVariant[variant];
  const reactId = useId();
  const prefix = idPrefix ?? reactId;
  const [draft, setDraft] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { clear, lastCompletedTerm, loading, search, suggestions } = useLocationSearch(projectId);
  const cities = suggestions.filter((suggestion) => suggestion.kind === "city");
  const countries = suggestions.filter((suggestion) => suggestion.kind === "country");
  const options = [...countries, ...cities];
  const currentInput = draft ?? value.displayName;
  const hasOptions = options.length > 0;
  const listId = `${prefix}-location-list`;
  const visible = expanded && (hasOptions || loading || Boolean(lastCompletedTerm));
  const normalizedActiveIndex = activeIndex >= 0 && activeIndex < options.length ? activeIndex : -1;
  const activeOption = normalizedActiveIndex >= 0 ? options[normalizedActiveIndex] : undefined;
  const showEmpty =
    expanded &&
    !loading &&
    options.length === 0 &&
    (lastCompletedTerm?.length ?? 0) >= EMPTY_PROVIDER_HINT_LENGTH;

  function selectOption(option: LocationSuggestion) {
    clear();
    setDraft(null);
    setExpanded(false);
    setActiveIndex(-1);
    onChange({
      canonicalKey: option.canonicalKey,
      cityName: option.cityName,
      countryCode: option.countryCode,
      displayName: option.displayName,
      hl: option.hl,
      kind: option.kind,
      languageLabel: option.languageLabel,
      regionName: option.regionName,
    });
  }

  function handleInput(next: string) {
    setDraft(next);
    setExpanded(true);
    setActiveIndex(-1);
    search(next);
  }

  const handleKeyDown = locationKeyHandler({
    activeOption,
    clear,
    draft,
    locations: options,
    selectOption,
    setActiveIndex,
    setDraft,
    setExpanded,
  });

  function handleBlur(event: FocusEvent<HTMLFieldSetElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setDraft(null);
    setExpanded(false);
    setActiveIndex(-1);
  }

  function clearDraft() {
    clear();
    setDraft(null);
    setExpanded(false);
    setActiveIndex(-1);
  }

  return (
    <fieldset className={labelClass} onBlur={handleBlur}>
      <FieldLabel
        className={labelHidden ? "sr-only" : undefined}
        help={help}
        htmlFor={`${prefix}-location`}
        label={label}
      />
      <div className="relative">
        <span className="relative flex items-center">
          <MapPin
            className="pointer-events-none absolute left-2.5 text-fg-faint"
            size={14}
            weight="bold"
          />
          <input
            aria-activedescendant={activeId(listId, activeOption)}
            aria-autocomplete="list"
            aria-controls={visible ? listId : undefined}
            aria-expanded={visible}
            aria-label={label}
            autoComplete="off"
            className={`${fieldClass} normal-case tracking-normal`}
            disabled={disabled}
            id={`${prefix}-location`}
            onChange={(event) => handleInput(event.target.value)}
            onFocus={() => setExpanded(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            value={currentInput}
          />
          {draft !== null ? (
            <button
              aria-label="Clear location search"
              className="absolute right-2 grid h-5 w-5 place-items-center rounded-full text-fg-faint hover:text-fg"
              onClick={clearDraft}
              type="button"
            >
              <X size={12} weight="bold" />
            </button>
          ) : null}
        </span>
        <LocationResults
          activeOption={activeOption}
          cities={cities}
          countries={countries}
          hasOptions={hasOptions}
          listId={listId}
          loading={loading}
          onPick={selectOption}
          showEmpty={showEmpty}
          visible={visible}
        />
      </div>
      {error ? <span className="normal-case text-red">{error}</span> : null}
    </fieldset>
  );
}

function LocationResults({
  activeOption,
  cities,
  countries,
  hasOptions,
  listId,
  loading,
  onPick,
  showEmpty,
  visible,
}: Readonly<{
  activeOption: LocationSuggestion | undefined;
  cities: LocationSuggestion[];
  countries: LocationSuggestion[];
  hasOptions: boolean;
  listId: string;
  loading: boolean;
  onPick: (option: LocationSuggestion) => void;
  showEmpty: boolean;
  visible: boolean;
}>) {
  if (!visible) return null;
  return (
    <div
      className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-[9px] border border-border bg-bg-elev py-1 shadow-lg"
      id={listId}
      role="listbox"
      tabIndex={-1}
    >
      {countries.length > 0 ? (
        <LocationGroup
          activeOption={activeOption}
          label="Countries"
          listId={listId}
          options={countries}
          onPick={onPick}
        />
      ) : null}
      {cities.length > 0 ? (
        <LocationGroup
          activeOption={activeOption}
          label="Cities"
          listId={listId}
          options={cities}
          onPick={onPick}
        />
      ) : null}
      {loading && !hasOptions ? (
        <span className="block px-3 py-2 normal-case text-fg-faint">Searching locations...</span>
      ) : null}
      {showEmpty ? (
        <span className="block px-3 py-2 normal-case text-fg-faint">
          No matches yet. City suggestions are powered by your connected providers.
        </span>
      ) : null}
    </div>
  );
}

type LocationGroupProps = {
  activeOption: LocationSuggestion | undefined;
  label: "Countries" | "Cities";
  listId: string;
  options: LocationSuggestion[];
  onPick: (option: LocationSuggestion) => void;
};

function LocationGroup({
  activeOption,
  label,
  listId,
  options,
  onPick,
}: Readonly<LocationGroupProps>) {
  return (
    <span className="block">
      <span className="block px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
        {label}
      </span>
      {options.map((option) => {
        const selected = activeOption?.id === option.id;
        const Icon = option.kind === "country" ? GlobeHemisphereWest : MapPin;
        return (
          <Fragment key={option.id}>
            <button
              aria-selected={selected}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left normal-case tracking-normal ${
                selected ? "bg-bg-sunken text-fg" : "text-fg hover:bg-bg-sunken"
              }`}
              id={activeId(listId, option)}
              onClick={() => onPick(option)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              <Icon className="mt-0.5 flex-none text-accent" size={14} weight="bold" />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold">
                  {option.kind === "city" ? option.cityName : option.displayName}
                </span>
                {option.kind === "city" ? (
                  <span className="block truncate text-[11.5px] text-fg-faint">
                    {cityCaption(option)}
                  </span>
                ) : null}
              </span>
            </button>
          </Fragment>
        );
      })}
    </span>
  );
}
