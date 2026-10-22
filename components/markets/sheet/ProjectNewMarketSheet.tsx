"use client";
import type { NewMarketCreateInput, NewMarketCreateResult } from "@/lib/markets/create-input";
import { initialMarketDevice, type MarketDeviceActions } from "@/lib/markets/device-targets-input";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { NewMarketSheet } from "./NewMarketSheet";
export function ProjectNewMarketSheet({
  markets,
  actions,
  canAddKeywords,
  open,
  onCreate,
  onClose,
  onAdded,
}: {
  markets: ProjectMarketsView;
  actions?: MarketDeviceActions;
  canAddKeywords: boolean;
  open: boolean;
  onCreate: (input: NewMarketCreateInput) => Promise<NewMarketCreateResult>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const context = markets.marketCreation ?? { registry: [], schedules: [], sources: [] };
  return (
    <NewMarketSheet
      onClose={onClose}
      onCreate={onCreate}
      open={open}
      projectId={markets.projectId}
      registry={context.registry}
      schedules={context.schedules}
      scheduleContext={context.scheduleContext}
      sources={context.sources}
      deviceTracking={
        canAddKeywords && actions
          ? {
              actions,
              activeMarketIds: markets.markets
                .filter((market) => market.status === "active")
                .map((market) => market.id),
              initialDeviceByMarket: Object.fromEntries(
                markets.markets.map((market) => [
                  market.id,
                  initialMarketDevice(market.trackedDevices),
                ]),
              ),
              candidatesByMarket: Object.fromEntries(
                markets.markets.map((market) => [market.id, market.deviceCandidates ?? []]),
              ),
              onAdded,
            }
          : undefined
      }
    />
  );
}
