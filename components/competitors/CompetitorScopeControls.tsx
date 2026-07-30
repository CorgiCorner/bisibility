"use client";

import { MenuSelect, type MenuSelectOption, SegmentedControl } from "@/components/ui";
import { competitorScopeHref } from "@/lib/competitors/scope-model";
import type { CompetitorMarketOption, CompetitorsViewModel } from "@/lib/competitors/types";
import {
  DeviceMobileIcon as DeviceMobile,
  FlagIcon as Flag,
  MagnifyingGlassIcon as MagnifyingGlass,
  MapPinIcon as MapPin,
  MapTrifoldIcon as MapTrifold,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

type CompetitorScopeControlsProps = {
  markets: CompetitorMarketOption[];
  projectRef: string;
  scope: CompetitorsViewModel["scope"];
  viewId?: string | null;
};

function locationIcon(kind: CompetitorMarketOption["locationKind"]) {
  if (kind === "country") return <Flag aria-hidden size={14} />;
  if (kind === "region") return <MapTrifold aria-hidden size={14} />;
  return <MapPin aria-hidden size={14} weight="fill" />;
}

function locationOptions(
  markets: CompetitorMarketOption[],
  device: "desktop" | "mobile",
): MenuSelectOption[] {
  const locations = new Map<
    string,
    Pick<CompetitorMarketOption, "location" | "locationId" | "locationKind"> & { count: number }
  >();
  for (const market of markets) {
    const current = locations.get(market.locationId);
    locations.set(market.locationId, {
      count: (current?.count ?? 0) + market.keywordCount,
      location: market.location,
      locationId: market.locationId,
      locationKind: market.locationKind,
    });
  }
  return [...locations.values()].map((location) => {
    const available = markets.some(
      (market) => market.locationId === location.locationId && market.device === device,
    );
    return {
      disabled: !available,
      icon: locationIcon(location.locationKind),
      label: location.location,
      secondary: `${location.count} keyword${location.count === 1 ? "" : "s"} · ${location.locationKind}`,
      tooltip: available ? undefined : `No ${device} keywords are tracked for this location.`,
      value: location.locationId,
    };
  });
}

export function CompetitorScopeControls({
  markets,
  projectRef,
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
  const options = locationOptions(markets, current.device);
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
    <div className="flex flex-wrap items-center gap-2">
      <MenuSelect
        ariaLabel="Competitor location"
        leadingIcon={<MapPin aria-hidden size={13} />}
        onChange={(locationId) => navigate({ ...current, locationId })}
        options={options}
        searchable
        searchPlaceholder="Search locations"
        triggerClassName="max-w-[280px]"
        value={current.locationId}
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
    </div>
  );
}
