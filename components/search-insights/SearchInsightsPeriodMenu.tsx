"use client";

import { Button, Tooltip } from "@/components/ui";
import { track } from "@/lib/analytics/client";
import type { DateFormat } from "@/lib/dates/format";
import type { FinalizedWindow } from "@/lib/search-insights/dates";
import type { SearchInsightsContext } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { cn } from "@/lib/ui/cn";
import {
  CalendarBlankIcon as CalendarBlank,
  CaretDownIcon as CaretDown,
  CheckIcon as Check,
} from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
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
  period: SearchInsightsContext["period"];
  window?: FinalizedWindow | null;
};

export function SearchInsightsPeriodMenu({
  dateFormat = "month_first",
  importFacts,
  period,
  window = null,
}: Readonly<PeriodMenuProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [pending, startTransition] = useTransition();
  const options = periodOptions(importFacts, window?.current.end ?? null, period, dateFormat);

  // The window lives in the URL so the server render owns it and a shared link keeps it.
  function pick(id: string) {
    setAnchorEl(null);
    if (id === period.id || pending) return;
    const next = new URLSearchParams(searchParams);
    next.set("period", id);
    startTransition(() => {
      track("search_insights_period_changed", { window: id });
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  const trigger = (
    <Button
      aria-expanded={Boolean(anchorEl)}
      aria-haspopup="listbox"
      aria-label={periodTriggerName(period, window, dateFormat)}
      loading={pending}
      loadingIndicator={
        <CalendarBlank
          weight="regular"
          aria-hidden
          className="animate-spin text-fg-muted"
          size={15}
        />
      }
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
