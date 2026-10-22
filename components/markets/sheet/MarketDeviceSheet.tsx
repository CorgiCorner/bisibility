"use client";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { initialMarketDevice, type MarketDeviceActions } from "@/lib/markets/device-targets-input";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ExistingMarketDevices } from "./ExistingMarketDevices";
import type { NewMarketScheduleOption } from "./NewMarketSchedule";
export function MarketDeviceSheet({
  market,
  projectId,
  schedules,
  actions,
  onClose,
  onAdded,
}: {
  market: MarketsPageRow;
  projectId: string;
  schedules: readonly NewMarketScheduleOption[];
  actions: MarketDeviceActions;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useTranslations("projectMarkets");
  const [actionsContainer, setActionsContainer] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState(false);
  const close = () => {
    if (!pending) onClose();
  };
  return (
    <Sheet
      open
      title={market.name}
      onClose={close}
      heightVariant="form"
      widthVariant="form"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" type="button" variant="secondary" onClick={close} disabled={pending}>
            {t("cancel")}
          </Button>
          <div ref={setActionsContainer} className="contents" />
        </div>
      }
    >
      <ExistingMarketDevices
        actions={actions}
        marketId={market.id}
        candidates={market.deviceCandidates}
        projectId={projectId}
        schedules={schedules}
        initialDevice={initialMarketDevice(market.trackedDevices)}
        onAdded={() => {
          onAdded();
          onClose();
        }}
        onPendingChange={setPending}
        actionsContainer={actionsContainer}
      />
    </Sheet>
  );
}
