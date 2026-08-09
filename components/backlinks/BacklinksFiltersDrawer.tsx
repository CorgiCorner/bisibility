"use client";

import {
  FilterSection,
  toggleFilterValue,
} from "@/components/keywords/filters/FilterDrawerControls";
import { Button, Checkbox, Sheet } from "@/components/ui";
import Slider from "@mui/material/Slider";
import {
  ArrowRightIcon as ArrowRight,
  CalendarBlankIcon as CalendarBlank,
  CaretRightIcon as CaretRight,
  ChartBarIcon as ChartBar,
  LinkIcon as Link,
  ProhibitIcon as Prohibit,
  TextTIcon as TextT,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  activeBacklinksFilterCount,
  type BacklinksFilters,
  type BacklinksLinkType,
  backlinksLinkTypeOptions,
  emptyBacklinksFilters,
} from "./backlinks-filters-model";

type BacklinksFiltersDrawerProps = {
  draft: BacklinksFilters;
  linkTypeCounts: Record<BacklinksLinkType, number>;
  onApply: () => void;
  onChange: (filters: BacklinksFilters) => void;
  onClose: () => void;
  open: boolean;
  resultCount: number;
};

const firstSeenOptions = [
  { id: "any" as const, label: "Any time" },
  { id: "30" as const, label: "30 days" },
  { id: "90" as const, label: "90 days" },
];

function RangeFilter({
  ariaLabel,
  max,
  onChange,
  title,
  value,
}: Readonly<{
  ariaLabel: string;
  max: number;
  onChange: (value: [number, number]) => void;
  title: string;
  value: [number, number];
}>) {
  return (
    <>
      <div className="mb-2 mt-3 flex items-center justify-between text-[12px] text-fg-muted">
        <span>{title}</span>
        <span className="font-mono text-[11px] font-semibold text-accent-text">
          {value[0]} - {value[1]}
        </span>
      </div>
      <Slider
        getAriaLabel={(index) => `${ariaLabel} ${index === 0 ? "minimum" : "maximum"}`}
        max={max}
        min={0}
        onChange={(_, next) => onChange(next as [number, number])}
        size="small"
        sx={{ color: "var(--accent)", display: "block", mx: 0.5, width: "calc(100% - 8px)" }}
        value={value}
      />
      <div className="flex justify-between font-mono text-[10px] text-fg-muted">
        <span>0</span>
        <span>{max}</span>
      </div>
    </>
  );
}

function TextFilter({
  icon,
  label,
  onChange,
  placeholder,
  value,
}: Readonly<{
  icon: ReactNode;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}>) {
  return (
    <label className="mt-3 block text-[12px] text-fg-muted">
      {label}
      <span className="mt-2 flex items-center gap-2 rounded-[9px] border border-border-strong bg-transparent px-[11px] py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid">
        <span aria-hidden className="text-fg-muted">
          {icon}
        </span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[12.5px] text-fg outline-none placeholder:text-fg-muted"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
      </span>
    </label>
  );
}

export function BacklinksFiltersDrawer({
  draft,
  linkTypeCounts,
  onApply,
  onChange,
  onClose,
  open,
  resultCount,
}: Readonly<BacklinksFiltersDrawerProps>) {
  const activeCount = activeBacklinksFilterCount(draft);
  const patch = (value: Partial<BacklinksFilters>) => onChange({ ...draft, ...value });

  return (
    <Sheet
      footer={
        <div className="grid gap-3">
          <p className="m-0 text-[12px] leading-[1.5] text-fg-muted">
            Filters run on the cached snapshot - applying them is free.
          </p>
          <div className="flex items-center gap-2.5">
            <Button
              onClick={() => onChange({ ...emptyBacklinksFilters })}
              type="button"
              variant="secondary"
            >
              Reset
            </Button>
            <Button
              endIcon={<CaretRight size={14} weight="bold" />}
              onClick={onApply}
              sx={{ flex: 1 }}
            >
              Show {resultCount.toLocaleString("en-US")} {resultCount === 1 ? "domain" : "domains"}
            </Button>
          </div>
        </div>
      }
      headerAction={
        <button
          className="rounded-md border-0 bg-transparent px-2.5 py-1.5 text-[12.5px] font-semibold text-fg-muted outline-none hover:text-accent-text focus-visible:text-accent-text"
          onClick={() => onChange({ ...emptyBacklinksFilters })}
          type="button"
        >
          Clear all
        </button>
      }
      heightVariant="filters"
      onClose={onClose}
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          Filters
          <span className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-accent-soft px-1.5 font-mono text-[10.5px] font-semibold text-accent-text">
            {activeCount}
          </span>
        </span>
      }
      widthVariant="filters"
    >
      <FilterSection icon={Link} title="Link type">
        <div className="mt-3 grid grid-cols-2 gap-[7px]">
          {backlinksLinkTypeOptions.map((option) => (
            <label
              className="flex cursor-pointer items-center gap-[9px] rounded-[9px] border border-border-strong bg-bg-elev px-[11px] py-[9px] hover:border-accent focus-within:border-accent"
              htmlFor={`backlinks-link-type-${option.id}`}
              key={option.id}
            >
              <Checkbox
                aria-label={option.label}
                checked={draft.linkTypes.includes(option.id)}
                id={`backlinks-link-type-${option.id}`}
                onChange={() => patch({ linkTypes: toggleFilterValue(draft.linkTypes, option.id) })}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">
                {option.label}
              </span>
              <span className="font-mono text-[11px] text-fg-muted">
                {linkTypeCounts[option.id]}
              </span>
            </label>
          ))}
        </div>
      </FilterSection>
      <FilterSection icon={ChartBar} title="Metrics">
        <RangeFilter
          ariaLabel="Domain authority"
          max={100}
          onChange={(domainAuthority) => patch({ domainAuthority })}
          title="Domain authority"
          value={draft.domainAuthority}
        />
        <RangeFilter
          ariaLabel="Spam score"
          max={10}
          onChange={(spamScore) => patch({ spamScore })}
          title="Spam score"
          value={draft.spamScore}
        />
      </FilterSection>
      <FilterSection icon={CalendarBlank} title="First seen">
        <fieldset className="mt-3 flex rounded-[8px] border-0 bg-bg-sunken p-[3px]">
          <legend className="sr-only">First seen</legend>
          {firstSeenOptions.map((option) => (
            <button
              aria-pressed={draft.firstSeen === option.id}
              className="flex-1 rounded-[6px] px-2 py-1.5 text-[12px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
              key={option.id}
              onClick={() => patch({ firstSeen: option.id })}
              style={{
                backgroundColor: draft.firstSeen === option.id ? "var(--bg-elev)" : "transparent",
                color: draft.firstSeen === option.id ? "var(--fg)" : "var(--fg-muted)",
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </FilterSection>
      <FilterSection icon={TextT} title="Text match">
        <TextFilter
          icon={<TextT size={14} />}
          label="Anchor contains"
          onChange={(anchorContains) => patch({ anchorContains })}
          placeholder="e.g. acme"
          value={draft.anchorContains}
        />
        <TextFilter
          icon={<ArrowRight size={14} />}
          label="Target URL contains"
          onChange={(targetUrlContains) => patch({ targetUrlContains })}
          placeholder="e.g. /desks"
          value={draft.targetUrlContains}
        />
        <TextFilter
          icon={<Prohibit size={14} />}
          label="Exclude domain"
          onChange={(excludeDomain) => patch({ excludeDomain })}
          placeholder="e.g. toolindex.app"
          value={draft.excludeDomain}
        />
      </FilterSection>
    </Sheet>
  );
}
