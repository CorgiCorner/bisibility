"use client";

import { CountryFlag } from "@/components/keywords/CountryFlag";
import { countryOptions } from "@/components/keywords/location-picker-data";
import { AnchoredList as Popper } from "@/components/ui/AnchoredList";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import {
  type ResearchScope,
  researchScopeForLocation,
  researchScopeKey,
  researchScopeOptionsForProject,
} from "@/lib/research/scope";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { type FocusEvent, type KeyboardEvent, useId, useRef, useState } from "react";

type ResearchScopePickerProps = {
  disabled?: boolean;
  onChange: (scope: ResearchScope) => void;
  scopes: readonly ResearchScope[];
  value: ResearchScope;
};

export function researchScopeLabel(scope: ResearchScope) {
  return `${scope.countryName} / ${scope.languageLabel}`;
}

function catalogMatches(query: string) {
  const normalized = query.trim().toLocaleLowerCase("en-US");
  if (!normalized) return [];
  return countryOptions
    .filter(
      (country) =>
        country.name.toLocaleLowerCase("en-US").includes(normalized) ||
        country.code.toLocaleLowerCase("en-US").includes(normalized),
    )
    .map((country) =>
      researchScopeForLocation({
        countryCode: country.code,
        languageCode: country.hl,
        languageLabel: country.languageLabel,
      }),
    );
}

export function ResearchScopePicker({
  disabled = false,
  onChange,
  scopes,
  value,
}: Readonly<ResearchScopePickerProps>) {
  const reactId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [draft, setDraft] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const options = researchScopeOptionsForProject([...scopes, ...catalogMatches(draft ?? "")]);
  const listId = `${reactId}-scope-list`;
  const visible = expanded && options.length > 0;
  const activeOption =
    activeIndex >= 0 && activeIndex < options.length ? options[activeIndex] : null;

  function selectScope(scope: ResearchScope) {
    setActiveIndex(-1);
    setDraft(null);
    setExpanded(false);
    onChange(scope);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setExpanded(true);
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      selectScope(activeOption);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setActiveIndex(-1);
      setDraft(null);
      setExpanded(false);
    }
  }

  function handleBlur(event: FocusEvent<HTMLFieldSetElement>) {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node &&
      (event.currentTarget.contains(nextTarget) || listboxRef.current?.contains(nextTarget))
    ) {
      return;
    }
    setActiveIndex(-1);
    setDraft(null);
    setExpanded(false);
  }

  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0 font-sans tabular-nums text-[10px] uppercase tracking-[0.4px] text-fg-muted"
      onBlur={handleBlur}
    >
      <FieldLabel
        className="sr-only"
        help="Defaults to the country and language you track most."
        htmlFor={`${reactId}-scope`}
        label="Country and language"
      />
      <span className="relative flex items-center" ref={anchorRef}>
        <CountryFlag
          className="pointer-events-none absolute left-2.5 h-3 w-4 rounded-[2px] shadow-sm"
          code={value.countryCode}
          fallback="globe"
        />
        <Input
          aria-activedescendant={activeOption ? `${listId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={visible ? listId : undefined}
          aria-expanded={visible}
          aria-label="Country and language"
          autoComplete="off"
          className="compact-text-13 min-h-[34px] w-full rounded-control border border-border-control bg-bg-elev px-9 py-1 text-[13px] font-normal normal-case tracking-normal"
          disabled={disabled}
          id={`${reactId}-scope`}
          onChange={(event) => {
            setActiveIndex(-1);
            setDraft(event.target.value);
            setExpanded(true);
          }}
          onFocus={() => setExpanded(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search country"
          role="combobox"
          value={draft ?? researchScopeLabel(value)}
        />
        {draft === null ? (
          <CaretDown
            aria-hidden
            className="pointer-events-none absolute right-3 text-fg-muted"
            size={11}
            weight="regular"
          />
        ) : null}
      </span>
      <Popper anchorEl={anchorRef.current} open={visible} ref={listboxRef}>
        <div
          className="max-h-64 overflow-auto rounded-control border border-border bg-bg-elev py-1"
          id={listId}
          role="listbox"
        >
          {options.map((scope, index) => (
            <button
              aria-selected={researchScopeKey(scope) === researchScopeKey(value)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left normal-case tracking-normal ${
                index === activeIndex ? "bg-bg-sunken text-fg" : "text-fg hover:bg-bg-sunken"
              }`}
              id={`${listId}-${index}`}
              key={researchScopeKey(scope)}
              onClick={() => selectScope(scope)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              <CountryFlag
                className="h-3 w-4 flex-none rounded-[2px] shadow-sm"
                code={scope.countryCode}
                fallback="globe"
              />
              <span className="truncate text-[12.5px] font-semibold">
                {researchScopeLabel(scope)}
              </span>
            </button>
          ))}
        </div>
      </Popper>
    </fieldset>
  );
}
