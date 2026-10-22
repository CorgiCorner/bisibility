"use client";
import type { MarketDefinitionRegistryEntry } from "@/components/markets/blocks/MarketDefinition";
import { Button } from "@/components/ui/Button";
import type {
  MarketDeviceActions,
  MarketDeviceCandidate,
} from "@/lib/markets/device-targets-input";
import { appPath, marketPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExistingMarketDevices } from "./ExistingMarketDevices";
import type { NewMarketScheduleOption } from "./NewMarketSchedule";
export type ExistingMarketDeviceTracking = {
  actions: MarketDeviceActions;
  activeMarketIds: readonly string[];
  candidatesByMarket?: Readonly<Record<string, readonly MarketDeviceCandidate[]>>;
  initialDeviceByMarket?: Readonly<Record<string, "desktop" | "mobile">>;
  onAdded?: () => void;
};
export function NewMarketExisting({
  market,
  projectId,
  schedules,
  tracking,
  onPendingChange,
  onAdded,
}: {
  market: MarketDefinitionRegistryEntry;
  projectId: string;
  schedules: readonly NewMarketScheduleOption[];
  tracking?: ExistingMarketDeviceTracking;
  onPendingChange?: (pending: boolean) => void;
  onAdded?: () => void;
}) {
  const t = useTranslations("projectMarkets");
  return (
    <div className="grid gap-4">
      <Button asChild variant="secondary" size="sm">
        <Link
          href={
            market.status === "archived"
              ? appPath(projectId, "markets")
              : marketPath(projectId, market.id, "rank-tracker")
          }
        >
          {market.status === "archived" ? t("viewMarkets") : t("openMarket")}
        </Link>
      </Button>
      {tracking?.activeMarketIds.includes(market.id) && market.status === "active" ? (
        <ExistingMarketDevices
          key={market.id}
          initialDevice={tracking.initialDeviceByMarket?.[market.id]}
          actions={tracking.actions}
          marketId={market.id}
          candidates={tracking.candidatesByMarket?.[market.id]}
          projectId={projectId}
          schedules={schedules}
          onAdded={onAdded ?? tracking.onAdded}
          onPendingChange={onPendingChange}
        />
      ) : null}
    </div>
  );
}
