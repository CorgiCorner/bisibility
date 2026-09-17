"use client";

import { MarketCombobox } from "@/components/markets/MarketCombobox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { competitorScopeHref } from "@/lib/competitors/scope-model";
import type { CompetitorMarketOption, CompetitorsViewModel } from "@/lib/competitors/types";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("projectCompetitors.ui");
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
    { icon: Monitor, label: t("desktop"), value: "desktop" as const },
    { icon: DeviceMobile, label: t("mobile"), value: "mobile" as const },
  ].map((option) => {
    const available = markets.some(
      (market) => market.locationId === current.locationId && market.device === option.value,
    );
    const Icon = option.icon;
    return {
      ariaLabel: t("competitorScopeAria", { device: option.label }),
      disabled: !available,
      label: (
        <>
          <Icon aria-hidden size={13} weight="regular" />
          {option.label}
        </>
      ),
      tooltip: available ? undefined : t("deviceNotTracked", { device: option.label }),
      value: option.value,
    };
  });

  const currentMarket = markets.find((m) => m.locationId === current.locationId) ?? markets[0];
  const options = competitorRegistryOptions(
    markets,
    current.device,
    {
      noDeviceKeywords: (values) => t("noDeviceKeywords", values),
      noVolumeData: t("noVolumeData"),
      noVolumeTooltip: t("noVolumeTooltip"),
      paused: t("paused"),
      pausedTooltip: t("pausedMarketTooltip"),
      trackDeviceKeywords: (values) => t("trackDeviceKeywords", values),
    },
    projectMarkets,
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-bg-sunken px-3 py-2.5">
      <span className="font-sans tabular-nums text-[11px] uppercase tracking-[0.5px] text-fg-muted">
        {t("market")}
      </span>
      <MarketCombobox
        ariaLabel={t("competitorMarket")}
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
        ariaLabel={t("competitorDevice")}
        fitContent
        onChange={(device) => navigate({ ...current, device })}
        options={deviceOptions}
        size="toolbar"
        value={current.device}
      />
      <span className="ml-auto flex items-center gap-1.5 font-sans tabular-nums text-[11px] text-fg-muted">
        <Info weight="regular" aria-hidden className="shrink-0 text-accent-text" size={13} />
        {t("sovScopeHint")}
      </span>
    </div>
  );
}
