"use client";

import {
  Button,
  filterChipStateClassName,
  MenuSelect,
  MonoText,
  SectionTitle,
  SegmentedControl,
} from "@/components/ui";
import type {
  CheckRange,
  CheckRunFilter,
  CheckRunProviderOption,
  CheckRunsCounts,
  CheckRunTriggerFilter,
} from "@/lib/checks/contract";
import Tooltip from "@mui/material/Tooltip";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { AsOfDatePopover } from "./AsOfDatePopover";
import { rangeOptions } from "./check-runs-format";

const asOfDateFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function asOfDateLabel(value: string) {
  return asOfDateFormat.format(new Date(`${value}T00:00:00.000Z`));
}

const triggerOptions = [
  { label: "All triggers", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Manual", value: "manual" },
] as const;

type HeaderProps = {
  asOfDate: string;
  now: Date;
  onAsOfDateChange: (date: string) => void;
  onProviderChange: (provider: string) => void;
  onRangeChange: (range: CheckRange) => void;
  onTriggerChange: (trigger: CheckRunTriggerFilter) => void;
  provider: string;
  providerOptions: readonly CheckRunProviderOption[];
  range: CheckRange;
  timeZone: string;
  trigger: CheckRunTriggerFilter;
};

export function CheckRunsHeader({
  asOfDate,
  now,
  onAsOfDateChange,
  onProviderChange,
  onRangeChange,
  onTriggerChange,
  provider,
  providerOptions,
  range,
  timeZone,
  trigger,
}: Readonly<HeaderProps>) {
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const providerMenuOptions = [{ label: "All providers", value: "all" }, ...providerOptions];

  return (
    <>
      <div className="flex flex-col gap-3 border-border border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionTitle id="check-runs-title">Check runs</SectionTitle>
          <MonoText muted>Newest first</MonoText>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MenuSelect
            ariaLabel="Filter by provider"
            onChange={onProviderChange}
            options={providerMenuOptions}
            value={provider}
          />
          <MenuSelect
            ariaLabel="Filter by trigger"
            onChange={(value) => onTriggerChange(value as CheckRunTriggerFilter)}
            options={triggerOptions}
            value={trigger}
          />
          <SegmentedControl
            activeVariant="accent"
            ariaLabel="Check run range"
            fitContent
            onChange={onRangeChange}
            options={rangeOptions}
            size="toolbar"
            value={range}
          />
          <Tooltip
            describeChild
            title={`Stats cover the selected ${range} window ending on this date. The table starts with the newest check on or before it.`}
          >
            <Button
              aria-expanded={Boolean(dateAnchor)}
              aria-haspopup="dialog"
              onClick={(event) => setDateAnchor(event.currentTarget)}
              size="sm"
              startIcon={<CalendarBlank aria-hidden size={15} />}
              variant="secondary"
            >
              As of: {asOfDateLabel(asOfDate)}
            </Button>
          </Tooltip>
        </div>
      </div>
      <AsOfDatePopover
        anchorEl={dateAnchor}
        now={now}
        onClose={() => setDateAnchor(null)}
        onSelect={onAsOfDateChange}
        selectedDate={asOfDate}
        timeZone={timeZone}
      />
    </>
  );
}

// Value tone mirrors the status palette: failed reads in the fail tone, skipped and
// fallback reads in the warn tone, completed stays default foreground.
const statTiles = [
  { count: "completed", filter: "completed", label: "Completed", valueClassName: "text-fg" },
  { count: "failed", filter: "failed", label: "Failed", valueClassName: "text-red-text" },
  { count: "deferred", filter: "deferred", label: "Skipped", valueClassName: "text-yellow-text" },
  {
    count: "viaFallback",
    filter: "fallback",
    label: "Fallback",
    valueClassName: "text-yellow-text",
  },
] as const satisfies readonly {
  count: keyof CheckRunsCounts;
  filter: CheckRunFilter;
  label: string;
  valueClassName: string;
}[];

type FilterProps = {
  counts: CheckRunsCounts;
  filter: CheckRunFilter;
  onFilterChange: (filter: CheckRunFilter) => void;
};

export function CheckRunStats({ counts, filter, onFilterChange }: Readonly<FilterProps>) {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 pt-4 lg:grid-cols-4">
      {statTiles.map((tile) => {
        const active = filter === tile.filter;
        return (
          <button
            aria-label={`Filter by ${tile.label} - ${counts[tile.count].toLocaleString("en-US")}`}
            aria-pressed={active}
            className={`min-w-0 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid ${
              active
                ? "border-accent bg-accent-soft"
                : "border-border bg-bg-elev hover:border-border-strong hover:bg-bg-sunken"
            }`}
            key={tile.filter}
            onClick={() => onFilterChange(tile.filter)}
            type="button"
          >
            <span className="block font-mono text-[10.5px] font-semibold uppercase tracking-[.05em] text-fg-muted">
              {tile.label}
            </span>
            <span
              className={`mt-1 block text-[20px] font-semibold leading-none ${tile.valueClassName}`}
            >
              {counts[tile.count].toLocaleString("en-US")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const filters: readonly {
  count: keyof CheckRunsCounts;
  id: CheckRunFilter;
  label: string;
  tooltip?: string;
}[] = [
  {
    count: "runs",
    id: "all",
    label: "Runs",
    tooltip: "Runs that executed: completed + failed + running",
  },
  { count: "completed", id: "completed", label: "Completed" },
  { count: "failed", id: "failed", label: "Failed" },
  { count: "running", id: "running", label: "Running" },
  {
    count: "deferred",
    id: "deferred",
    label: "Skipped",
    tooltip: "Skipped before start - aggregated by reason",
  },
  {
    count: "viaFallback",
    id: "fallback",
    label: "Fallback",
    tooltip: "Completed runs served by a fallback provider",
  },
];

export function CheckRunFilters({ counts, filter, onFilterChange }: Readonly<FilterProps>) {
  return (
    <nav aria-label="Check run filters" className="flex flex-wrap gap-1.5 px-4 py-3">
      {filters.map((item) => {
        const selected = filter === item.id;
        return (
          <button
            aria-pressed={selected}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-semibold outline-none transition-colors ${filterChipStateClassName(
              selected,
            )}`}
            key={item.id}
            onClick={() => onFilterChange(item.id)}
            title={item.tooltip}
            type="button"
          >
            {item.label}
            <span className="font-mono text-[10px] opacity-75">
              {counts[item.count].toLocaleString("en-US")}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
