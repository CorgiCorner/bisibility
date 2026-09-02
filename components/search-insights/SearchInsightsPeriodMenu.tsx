"use client";

import { Button } from "@/components/ui";
import { track } from "@/lib/analytics/client";
import type { SearchInsightsContext } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { cn } from "@/lib/ui/cn";
import {
  CalendarBlankIcon as CalendarBlank,
  CaretDownIcon as CaretDown,
  CheckIcon as Check,
} from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SearchInsightsMenu, SearchInsightsMenuOption } from "./SearchInsightsMenu";
import { PERIOD_MENU_LABEL } from "./search-insights-copy";
import { periodOptions, periodTriggerLabel } from "./search-insights-workspace-model";

type PeriodMenuProps = {
  importFacts?: ImportObservabilityFacts | null;
  period: SearchInsightsContext["period"];
  yoy: SearchInsightsContext["yoy"];
};

export function SearchInsightsPeriodMenu({ importFacts, period, yoy }: Readonly<PeriodMenuProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const options = periodOptions(yoy, importFacts);

  // The window lives in the URL so the server render owns it and a shared link keeps it.
  function pick(id: string) {
    setAnchorEl(null);
    if (id === period.id) return;
    const next = new URLSearchParams(searchParams);
    next.set("period", id);
    track("search_insights_period_changed", { window: id });
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <>
      <Button
        aria-expanded={Boolean(anchorEl)}
        aria-haspopup="listbox"
        aria-label={PERIOD_MENU_LABEL}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        size="sm"
        variant="secondary"
      >
        <span className="flex items-center gap-2 whitespace-nowrap">
          <CalendarBlank
            weight="regular"
            aria-hidden
            className="shrink-0 text-fg-muted"
            size={15}
          />
          <span className="font-sans tabular-nums text-ui-caption">
            {periodTriggerLabel(period)}
          </span>
          <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="regular" />
        </span>
      </Button>
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
                <span className="font-sans tabular-nums text-ui-caption text-fg-muted">
                  {option.sub}
                </span>
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
