"use client";

import { MenuSelect, SegmentedControl } from "@/components/ui";
import { competitorScopeHref } from "@/lib/competitors/scope-model";
import type { CompetitorMarketOption, CompetitorsViewModel } from "@/lib/competitors/types";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import {
  DeviceMobileIcon as DeviceMobile,
  InfoIcon as Info,
  MagnifyingGlassIcon as MagnifyingGlass,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { CompetitorMarketSelector } from "./CompetitorMarketSelector";

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

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[11px] border border-border bg-bg-sunken px-3 py-2.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">Market</span>
      <CompetitorMarketSelector
        currentDevice={current.device}
        currentLocationId={current.locationId}
        markets={markets}
        onChange={(market) =>
          navigate({ device: market.device, engine: market.engine, locationId: market.locationId })
        }
        projectMarkets={projectMarkets}
      />
      <SegmentedControl
        ariaLabel="Competitor device"
        fitContent
        onChange={(device) => navigate({ ...current, device })}
        options={deviceOptions}
        size="toolbar"
        value={current.device}
      />
      <MenuSelect
        ariaLabel="Search engine"
        leadingIcon={<MagnifyingGlass aria-hidden size={13} />}
        onChange={() => undefined}
        options={[{ disabled: true, label: "Google", value: "google" }]}
        value="google"
      />
      <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-fg-muted">
        <Info aria-hidden className="shrink-0 text-accent-text" size={13} />
        SOV compares one market (location + language) + device + engine at a time
      </span>
    </div>
  );
}
