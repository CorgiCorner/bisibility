"use client";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import type { DateFormat } from "@/lib/dates/format";
import type { FinalizedWindow } from "@/lib/search-insights/dates";
import type { SearchInsightsContext } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { cn } from "@/lib/ui/cn";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { useState } from "react";
import { SearchInsightsMenu, SearchInsightsMenuOption } from "./SearchInsightsMenu";
import { PERIOD_MENU_LABEL } from "./search-insights-copy";
import {
  periodOptions,
  periodTooltipLines,
  periodTriggerLabel,
  periodTriggerName,
} from "./search-insights-workspace-model";

type PeriodMenuProps = {
  dateFormat?: DateFormat;
  importFacts?: ImportObservabilityFacts | null;
  onPeriodChange: (id: string) => void;
  pending?: boolean;
  period: SearchInsightsContext["period"];
  window?: FinalizedWindow | null;
};

export function SearchInsightsPeriodMenu({
  dateFormat = "month_first",
  importFacts,
  onPeriodChange,
  pending = false,
  period,
  window = null,
}: Readonly<PeriodMenuProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const options = periodOptions(importFacts, window?.current.end ?? null, period, dateFormat);

  function pick(id: string) {
    setAnchorEl(null);
    if (id === period.id || pending) return;
    onPeriodChange(id);
  }

  const trigger = (
    <Button
      aria-expanded={Boolean(anchorEl)}
      aria-haspopup="listbox"
      aria-label={periodTriggerName(period, window, dateFormat)}
      disabled={pending}
      onClick={(event) => setAnchorEl(event.currentTarget)}
      size="sm"
      startIcon={<CalendarBlank weight="regular" aria-hidden className="text-fg-muted" size={15} />}
      variant="secondary"
    >
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span className="font-sans tabular-nums text-ui-caption">
          {periodTriggerLabel(period, window, dateFormat)}
        </span>
        <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="regular" />
      </span>
    </Button>
  );

  return (
    <>
      {window ? (
        <Tooltip
          content={
            <span
              className="block max-w-80 whitespace-normal text-left"
              data-testid="period-tooltip-content"
            >
              {periodTooltipLines(period, window, dateFormat).map((line) => (
                <span className="block" key={line}>
                  {line}
                </span>
              ))}
            </span>
          }
          placement="bottom-start"
          semantics="description"
        >
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <SearchInsightsMenu
        anchorEl={anchorEl}
        ariaLabel={PERIOD_MENU_LABEL}
        onClose={() => setAnchorEl(null)}
      >
        {options.map((option) => (
          <SearchInsightsMenuOption
            disabled={option.disabled}
            key={option.id}
            onSelect={() => pick(option.id)}
            selected={option.id === period.id}
          >
            <span className="flex w-full min-w-0 items-center gap-2.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn(option.disabled ? "text-fg-muted" : "text-fg")}>
                  {option.label}
                </span>
                {option.dates || option.sub ? (
                  <span className="font-sans tabular-nums text-ui-caption text-fg-muted">
                    {[option.dates, option.sub].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </span>
              {option.id === period.id ? (
                <Check
                  aria-hidden
                  className="shrink-0 text-accent-text"
                  size={13}
                  weight="regular"
                />
              ) : null}
            </span>
          </SearchInsightsMenuOption>
        ))}
      </SearchInsightsMenu>
    </>
  );
}
