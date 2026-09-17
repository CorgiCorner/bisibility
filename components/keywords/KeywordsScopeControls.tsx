"use client";

import { useMarketContext } from "@/components/markets/MarketContextProvider";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { Pill } from "@/components/ui/Pill";
import { type ActiveLens, type LensLocationOption, lensHref } from "@/lib/keywords/lens-model";
import {
  rankTrackerNavigationHref,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { GlobeHemisphereWestIcon as GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

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

function locationMenuOptions(
  locationOptions: LensLocationOption[],
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.management.grid">>,
): MenuSelectOption[] {
  return [
    {
      icon: <GlobeHemisphereWest weight="regular" aria-hidden size={14} />,
      label: t("allLocations"),
      value: ALL_LOCATIONS,
    },
    ...locationOptions.map((option) => ({
      icon: <MapPin aria-hidden size={14} weight="regular" />,
      label: option.displayName,
      noWrap: true,
      secondary: t("locationOption", {
        count: option.count,
        kind: option.kind === "city" ? t("locationCity") : t("locationCountry"),
      }),
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

function locationLabel(
  lens: ActiveLens,
  locationOptions: LensLocationOption[],
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.management.grid">>,
) {
  if (!lens.locationId) {
    return null;
  }
  return (
    locationOptions.find((option) => option.id === lens.locationId)?.displayName ??
    t("locationFallback")
  );
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
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const go = useScopeNavigation({ basePath, lens, onQueryNavigation, query, viewId });

  return (
    <MenuSelect
      ariaLabel={t("locationScope")}
      leadingIcon={<MapPin weight="regular" className="text-fg-muted" size={13} />}
      menuMinWidth={280}
      onChange={(value) => go({ ...lens, locationId: value === ALL_LOCATIONS ? null : value })}
      options={locationMenuOptions(locationOptions, t)}
      triggerClassName={triggerClassName}
      value={lens.locationId ?? ALL_LOCATIONS}
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
  const { market } = useMarketContext();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {!market ? (
        <div className="hidden min-w-0 max-w-full lg:block lg:max-w-[200px] xl:max-w-[260px]">
          <KeywordsScopeLocationSelect
            basePath={basePath}
            lens={lens}
            locationOptions={locationOptions}
            onQueryNavigation={onQueryNavigation}
            triggerClassName="max-w-full"
            viewId={viewId}
            query={query}
          />
        </div>
      ) : null}
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
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const { market } = useMarketContext();
  const go = useScopeNavigation({ basePath, lens, onQueryNavigation, query, viewId });
  const label = locationLabel(lens, locationOptions, t);

  if (market || !label) {
    return null;
  }

  return (
    <Pill active className="lg:hidden" onClick={() => go({ ...lens, locationId: null })} size="sm">
      {t("scopeChip", { location: label })}
      <X size={11} weight="regular" />
    </Pill>
  );
}
