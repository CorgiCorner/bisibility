"use client";

import {
  LocationClearButton,
  locationFieldClassByVariant,
  locationFieldLabelClass,
} from "@/components/keywords/location-field-parts";
import { locationKeyHandler } from "@/components/keywords/location-key-handler";
import {
  EMPTY_PROVIDER_HINT_LENGTH,
  type LocationFieldValue,
  type LocationSuggestion,
  useLocationSearch,
} from "@/components/keywords/location-picker-data";
import { FieldLabel, Input } from "@/components/ui";
import Popper from "@mui/material/Popper";
import { MapPinIcon as MapPin } from "@phosphor-icons/react";
import { type FocusEvent, useId, useRef, useState } from "react";
import { LocationResults, locationOptionDomId } from "./location-field-results";

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
  controlClassName?: string;
};

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
  controlClassName,
}: Readonly<LocationFieldProps>) {
  const fieldClass = locationFieldClassByVariant[variant];
  const reactId = useId();
  const prefix = idPrefix ?? reactId;
  const [draft, setDraft] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
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
      languageCode: option.languageCode,
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
    if (nextTarget instanceof Node) {
      if (event.currentTarget.contains(nextTarget)) return;
      if (listboxRef.current?.contains(nextTarget)) return;
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
    <fieldset className={locationFieldLabelClass} onBlur={handleBlur}>
      <FieldLabel
        className={labelHidden ? "sr-only" : undefined}
        help={help}
        htmlFor={`${prefix}-location`}
        label={label}
      />
      <div>
        <span className="relative flex items-center" ref={anchorRef}>
          <MapPin
            className="pointer-events-none absolute left-2.5 text-fg-muted"
            size={14}
            weight="bold"
          />
          <Input
            aria-activedescendant={
              normalizedActiveIndex >= 0
                ? locationOptionDomId(listId, normalizedActiveIndex)
                : undefined
            }
            aria-autocomplete="list"
            aria-controls={visible ? listId : undefined}
            aria-expanded={visible}
            aria-label={label}
            autoComplete="off"
            className={`${fieldClass} ${controlClassName ?? ""} normal-case tracking-normal`}
            disabled={disabled}
            id={`${prefix}-location`}
            onChange={(event) => handleInput(event.target.value)}
            onFocus={() => setExpanded(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            value={currentInput}
          />
          {draft !== null ? <LocationClearButton onClick={clearDraft} /> : null}
        </span>
        <Popper
          anchorEl={anchorRef.current}
          open={visible}
          placement="bottom-start"
          ref={listboxRef}
          sx={(theme) => ({ zIndex: theme.zIndex.modal + 1 })}
          modifiers={[
            { name: "flip", enabled: true },
            { name: "preventOverflow", enabled: true, options: { padding: 8 } },
            { name: "offset", enabled: true, options: { offset: [0, 4] } },
            {
              name: "sameWidth",
              enabled: true,
              phase: "beforeWrite",
              requires: ["computeStyles"],
              fn: ({ state }) => {
                state.styles.popper.width = `${state.rects.reference.width}px`;
              },
            },
          ]}
        >
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
        </Popper>
      </div>
      {error ? <span className="normal-case text-red-text">{error}</span> : null}
    </fieldset>
  );
}
