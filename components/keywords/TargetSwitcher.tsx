"use client";

import {
  ContextSwitcherCaret,
  contextSwitcherTriggerClassName,
} from "@/components/shell/ContextSwitcherTrigger";
import { MarketSwitcher } from "@/components/shell/MarketSwitcher";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { HeaderContextMarket } from "@/lib/markets/header-context";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { appPath } from "@/lib/routing/app-path";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
import { useRouter } from "next/navigation";

type TargetSwitcherProps = {
  keyword: KeywordRow;
  onAddMarket?: () => void;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  targets: readonly KeywordRow[];
};

function deviceLabel(device: string) {
  return device.toLowerCase() === "mobile" ? "Mobile" : "Desktop";
}

export function TargetSwitcher({
  keyword,
  onAddMarket,
  projectId,
  projectMarkets,
  targets,
}: Readonly<TargetSwitcherProps>) {
  const router = useRouter();
  const targetList = [
    ...new Map([keyword, ...targets].map((target) => [target.id, target])).values(),
  ];
  const sameMarket = targetList.filter(
    (target) => target.location.canonicalKey === keyword.location.canonicalKey,
  );
  const trackedMarketKeys = new Set(targetList.map((target) => target.location.canonicalKey));
  const markets: HeaderContextMarket[] = (projectMarkets?.markets ?? [])
    .filter((market) => trackedMarketKeys.has(market.canonicalKey))
    .map((market) => ({
      countryCode: market.countryCode,
      description: `${market.displayName} / ${market.languageLabel}`,
      keywordCount: market.keywordCount ?? 0,
      languageCode: market.languageCode,
      name: market.name ?? market.displayName,
      ref: market.id,
      status: market.status,
    }));
  const currentMarket = projectMarkets?.markets.find(
    (market) => market.canonicalKey === keyword.location.canonicalKey,
  );

  function selectMarket(ref: string) {
    if (ref === currentMarket?.id) return;
    const locationKey = projectMarkets?.markets.find((market) => market.id === ref)?.canonicalKey;
    const candidates = targetList.filter((target) => target.location.canonicalKey === locationKey);
    const next =
      candidates.find((target) => target.device.toLowerCase() === keyword.device.toLowerCase()) ??
      candidates[0];
    if (next) router.push(appPath(projectId, "rank-tracker", next.id));
  }

  return (
    <>
      {projectMarkets ? (
        <MarketSwitcher
          market={markets.find((market) => market.ref === currentMarket?.id)}
          markets={markets}
          onSelectMarket={selectMarket}
          onAddMarket={onAddMarket ?? null}
          showAllMarkets={false}
          pathname={appPath(projectId, "rank-tracker", keyword.id)}
          projectRef={projectId}
        />
      ) : null}
      <MenuSelect
        ariaLabel="Device scope"
        onChange={(value) => {
          if (value !== keyword.id) router.push(appPath(projectId, "rank-tracker", value));
        }}
        options={sameMarket.map((target) => ({
          icon:
            target.device.toLowerCase() === "mobile" ? (
              <DeviceMobile aria-hidden size={14} weight="regular" />
            ) : (
              <Monitor aria-hidden size={14} weight="regular" />
            ),
          label: deviceLabel(target.device),
          value: target.id,
        }))}
        trailingIcon={<ContextSwitcherCaret />}
        triggerClassName={contextSwitcherTriggerClassName}
        value={keyword.id}
      />
    </>
  );
}
