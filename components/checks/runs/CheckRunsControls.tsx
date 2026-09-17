"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { filterChipStateClassName } from "@/components/ui/filter-chip-styles";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import type {
  CheckRange,
  CheckRunFilter,
  CheckRunProviderOption,
  CheckRunsCounts,
  CheckRunTriggerFilter,
} from "@/lib/checks/contract";
import { formatDisplayDate } from "@/lib/dates/format";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { AsOfDatePopover } from "./AsOfDatePopover";
import { rangeValues } from "./check-runs-format";

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
  const dateDisplay = useDateDisplay();
  const t = useTranslations("projectRankTracker.checks");
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const providerMenuOptions = [{ label: t("allProviders"), value: "all" }, ...providerOptions];
  const triggerOptions = [
    { label: t("allTriggers"), value: "all" },
    { label: t("scheduled"), value: "scheduled" },
    { label: t("manual"), value: "manual" },
  ] as const;
  const rangeOptions = rangeValues.map((value) => ({ label: t(`range${value}`), value }));

  return (
    <>
      <div className="flex flex-col gap-3 border-border border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionTitle id="check-runs-title">{t("checkRuns")}</SectionTitle>
          <span>{t("newestFirst")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MenuSelect
            ariaLabel={t("filterByProvider")}
            onChange={onProviderChange}
            options={providerMenuOptions}
            value={provider}
          />
          <MenuSelect
            ariaLabel={t("filterByTrigger")}
            onChange={(value) => onTriggerChange(value as CheckRunTriggerFilter)}
            options={triggerOptions}
            value={trigger}
          />
          <SegmentedControl
            ariaLabel={t("checkRunRange")}
            fitContent
            onChange={onRangeChange}
            options={rangeOptions}
            size="toolbar"
            value={range}
          />
          <Tooltip
            semantics="description"
            content={t("asOfTooltip", { range: t(`range${range}`) })}
          >
            <Button
              aria-expanded={Boolean(dateAnchor)}
              aria-haspopup="dialog"
              onClick={(event) => setDateAnchor(event.currentTarget)}
              size="sm"
              startIcon={<CalendarBlank weight="regular" aria-hidden size={15} />}
              style={{ fontWeight: 400 }}
              variant="secondary"
            >
              {t("asOf", { date: formatDisplayDate(asOfDate, dateDisplay) })}
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
  { count: "completed", filter: "completed", label: "completed", valueClassName: "text-fg" },
  { count: "failed", filter: "failed", label: "failed", valueClassName: "text-red-text" },
  { count: "deferred", filter: "deferred", label: "skipped", valueClassName: "text-yellow-text" },
  {
    count: "viaFallback",
    filter: "fallback",
    label: "fallback",
    valueClassName: "text-yellow-text",
  },
] as const satisfies readonly {
  count: keyof CheckRunsCounts;
  filter: CheckRunFilter;
  label: "completed" | "failed" | "skipped" | "fallback";
  valueClassName: string;
}[];

type FilterProps = {
  counts: CheckRunsCounts;
  filter: CheckRunFilter;
  onFilterChange: (filter: CheckRunFilter) => void;
};

export function CheckRunStats({ counts, filter, onFilterChange }: Readonly<FilterProps>) {
  const locale = useLocale();
  const t = useTranslations("projectRankTracker.checks");
  return (
    <div className="grid grid-cols-2 gap-2 px-4 pt-4 lg:grid-cols-4">
      {statTiles.map((tile) => {
        const active = filter === tile.filter;
        const label = t(tile.label);
        return (
          <button
            aria-label={t("filterByCount", { count: counts[tile.count], label })}
            aria-pressed={active}
            className={`min-w-0 rounded-card border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid ${
              active
                ? "border-accent bg-accent-soft"
                : "border-border-control bg-bg-elev hover:border-border-control hover:bg-bg-sunken"
            }`}
            key={tile.filter}
            onClick={() => onFilterChange(tile.filter)}
            type="button"
          >
            <span className="block font-sans tabular-nums text-[10.5px] font-semibold uppercase tracking-[.05em] text-fg-muted">
              {label}
            </span>
            <span
              className={`mt-1 block text-[20px] font-semibold leading-none ${tile.valueClassName}`}
            >
              {new Intl.NumberFormat(locale).format(counts[tile.count])}
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
  label: "runs" | "completed" | "failed" | "running" | "skipped" | "fallback";
  tooltip?: "runsTooltip" | "skippedTooltip" | "fallbackTooltip";
}[] = [
  {
    count: "runs",
    id: "all",
    label: "runs",
    tooltip: "runsTooltip",
  },
  { count: "completed", id: "completed", label: "completed" },
  { count: "failed", id: "failed", label: "failed" },
  { count: "running", id: "running", label: "running" },
  {
    count: "deferred",
    id: "deferred",
    label: "skipped",
    tooltip: "skippedTooltip",
  },
  {
    count: "viaFallback",
    id: "fallback",
    label: "fallback",
    tooltip: "fallbackTooltip",
  },
];

export function CheckRunFilters({ counts, filter, onFilterChange }: Readonly<FilterProps>) {
  const locale = useLocale();
  const t = useTranslations("projectRankTracker.checks");
  return (
    <nav aria-label={t("checkRunFilters")} className="flex flex-wrap gap-1.5 px-4 py-3">
      {filters.map((item) => {
        const selected = filter === item.id;
        const label = t(item.label);
        return (
          <button
            aria-pressed={selected}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-control border px-2.5 text-[11.5px] font-semibold outline-none transition-colors ${filterChipStateClassName(
              selected,
            )}`}
            key={item.id}
            onClick={() => onFilterChange(item.id)}
            title={item.tooltip ? t(item.tooltip) : undefined}
            type="button"
          >
            {label}
            <span className="font-sans tabular-nums text-[10px] opacity-75">
              {new Intl.NumberFormat(locale).format(counts[item.count])}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
