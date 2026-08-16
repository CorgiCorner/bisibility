"use client";

import { MarketCombobox } from "@/components/markets/MarketCombobox";
import { SegmentedControl } from "@/components/ui";
import { competitorScopeHref } from "@/lib/competitors/scope-model";
import type { CompetitorMarketOption, CompetitorsViewModel } from "@/lib/competitors/types";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import {
  DeviceMobileIcon as DeviceMobile,
  InfoIcon as Info,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { competitorRegistryOptions } from "./competitor-market-mapping";

type CompetitorScopeControlsProps = {
  markets: CompetitorMarketOption[];
  projectMarkets?: ProjectMarketsView;
  projectRef: string;
  scope: CompetitorsViewModel["scope"];
  viewId?: string | null;
};

export function CompetitorScopeControls({
  markets,
  projectRef,
  projectMarkets,
  scope,
  viewId,
}: Readonly<CompetitorScopeControlsProps>) {
  const router = useRouter();
  const fallback = markets[0];
  const current =
    scope ??
    (fallback
      ? { device: fallback.device, engine: fallback.engine, locationId: fallback.locationId }
      : null);
  if (!current) return null;

  const navigate = (next: typeof current) =>
    router.push(competitorScopeHref(projectRef, next, viewId));
  const deviceOptions = [
    { icon: Monitor, label: "Desktop", value: "desktop" as const },
    { icon: DeviceMobile, label: "Mobile", value: "mobile" as const },
  ].map((option) => {
    const available = markets.some(
      (market) => market.locationId === current.locationId && market.device === option.value,
    );
    const Icon = option.icon;
    return {
      ariaLabel: `${option.label} competitor scope`,
      disabled: !available,
      label: (
        <>
          <Icon aria-hidden size={13} />
          {option.label}
        </>
      ),
      tooltip: available ? undefined : `${option.label} is not tracked for the selected location.`,
      value: option.value,
    };
  });

  const currentMarket = markets.find((m) => m.locationId === current.locationId) ?? markets[0];
  const options = competitorRegistryOptions(markets, current.device, projectMarkets);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[11px] border border-border bg-bg-sunken px-3 py-2.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.5px] text-fg-muted">Market</span>
      <MarketCombobox
        ariaLabel="Competitor market"
        catalogMarkets={[]}
        menuWidth={280}
        onChange={(payload) => {
          if (payload) {
            navigate({
              device: payload.device,
              engine: payload.engine,
              locationId: payload.locationId,
            });
          }
        }}
        trackedMarkets={options}
        triggerClassName="max-w-[280px]"
        value={currentMarket?.canonicalKey ?? ""}
      />
      <SegmentedControl
        ariaLabel="Competitor device"
        fitContent
        onChange={(device) => navigate({ ...current, device })}
        options={deviceOptions}
        size="toolbar"
        value={current.device}
      />
      <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-fg-muted">
        <Info aria-hidden className="shrink-0 text-accent-text" size={13} />
        SOV compares one market (location + language) + device at a time
      </span>
    </div>
  );
}
