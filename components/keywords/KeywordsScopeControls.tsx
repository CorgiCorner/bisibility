"use client";

import { MenuSelect, type MenuSelectOption, Pill, SegmentedControl } from "@/components/ui";
import {
  type ActiveLens,
  type LensDevice,
  type LensLocationOption,
  lensHref,
} from "@/lib/keywords/lens-model";
import {
  rankTrackerNavigationHref,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import {
  DeviceMobileIcon as DeviceMobile,
  DevicesIcon as Devices,
  GlobeHemisphereWestIcon as GlobeHemisphereWest,
  MapPinIcon as MapPin,
  MonitorIcon as Monitor,
  XIcon as X,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";

const ALL_LOCATIONS = "__all__";
type ScopeNavigationProps = {
  basePath: string;
  lens: ActiveLens;
  viewId?: string | null;
  query?: RankTrackerQueryState;
  onQueryNavigation?: () => void;
};

type LocationSelectProps = ScopeNavigationProps & {
  locationOptions: LensLocationOption[];
  triggerClassName?: string;
};

type KeywordsScopeControlsProps = ScopeNavigationProps & {
  locationOptions: LensLocationOption[];
};

const deviceTabs: { value: LensDevice; label: string; icon: typeof Monitor }[] = [
  { icon: Devices, label: "All", value: "all" },
  { icon: Monitor, label: "Desktop", value: "desktop" },
  { icon: DeviceMobile, label: "Mobile", value: "mobile" },
];

function locationMenuOptions(locationOptions: LensLocationOption[]): MenuSelectOption[] {
  return [
    {
      icon: <GlobeHemisphereWest aria-hidden size={14} />,
      label: "All locations",
      value: ALL_LOCATIONS,
    },
    ...locationOptions.map((option) => ({
      icon: <MapPin aria-hidden size={14} weight={option.kind === "city" ? "fill" : "regular"} />,
      label: option.displayName,
      secondary: `${option.count} keyword${option.count === 1 ? "" : "s"} · ${option.kind}`,
      value: option.id,
    })),
  ];
}

function useScopeNavigation({
  basePath,
  onQueryNavigation,
  query,
  viewId = null,
}: ScopeNavigationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (next: ActiveLens) => {
    if (!query) return router.push(lensHref(basePath, next, viewId));
    onQueryNavigation?.();
    return router.push(
      rankTrackerNavigationHref({
        basePath,
        current: searchParams,
        present: ["device", "location", "page"],
        query: resetRankTrackerPage({ ...query, lens: next }),
      }),
    );
  };
}

function locationLabel(lens: ActiveLens, locationOptions: LensLocationOption[]) {
  if (!lens.locationId) {
    return null;
  }
  return locationOptions.find((option) => option.id === lens.locationId)?.displayName ?? "Location";
}

export function KeywordsScopeLocationSelect({
  basePath,
  lens,
  locationOptions,
  onQueryNavigation,
  triggerClassName,
  viewId,
  query,
}: LocationSelectProps) {
  const go = useScopeNavigation({ basePath, lens, onQueryNavigation, query, viewId });

  return (
    <MenuSelect
      ariaLabel="Location scope"
      leadingIcon={<MapPin className="text-fg-muted" size={13} />}
      onChange={(value) => go({ ...lens, locationId: value === ALL_LOCATIONS ? null : value })}
      options={locationMenuOptions(locationOptions)}
      triggerClassName={triggerClassName}
      value={lens.locationId ?? ALL_LOCATIONS}
    />
  );
}

export function KeywordsDeviceScope({
  basePath,
  lens,
  onQueryNavigation,
  query,
  viewId,
}: Readonly<ScopeNavigationProps>) {
  const go = useScopeNavigation({ basePath, lens, onQueryNavigation, query, viewId });

  return (
    <SegmentedControl
      activeVariant="neutral"
      ariaLabel="Device scope"
      className="m-0 shrink-0"
      fitContent
      onChange={(device) => go({ ...lens, device })}
      optionClassName="min-w-8 sm:min-w-0"
      options={deviceTabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.value === lens.device;
        return {
          ariaLabel: `${tab.label} device scope`,
          label: (
            <>
              <Icon aria-hidden size={13} weight={active ? "fill" : "regular"} />
              <span className="hidden sm:inline">{tab.label}</span>
            </>
          ),
          value: tab.value,
        };
      })}
      size="toolbar"
      value={lens.device}
    />
  );
}

export function KeywordsScopeControls({
  basePath,
  lens,
  locationOptions,
  onQueryNavigation,
  viewId,
  query,
}: KeywordsScopeControlsProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="hidden min-w-0 lg:block">
        <KeywordsScopeLocationSelect
          basePath={basePath}
          lens={lens}
          locationOptions={locationOptions}
          onQueryNavigation={onQueryNavigation}
          triggerClassName="max-w-[260px]"
          viewId={viewId}
          query={query}
        />
      </div>
      <KeywordsDeviceScope
        basePath={basePath}
        lens={lens}
        onQueryNavigation={onQueryNavigation}
        query={query}
        viewId={viewId}
      />
    </div>
  );
}

export function KeywordsScopeLocationChip({
  basePath,
  lens,
  locationOptions,
  onQueryNavigation,
  viewId,
  query,
}: KeywordsScopeControlsProps) {
  const go = useScopeNavigation({ basePath, lens, onQueryNavigation, query, viewId });
  const label = locationLabel(lens, locationOptions);

  if (!label) {
    return null;
  }

  return (
    <Pill active className="lg:hidden" onClick={() => go({ ...lens, locationId: null })} size="sm">
      Scope: {label}
      <X size={11} weight="bold" />
    </Pill>
  );
}
