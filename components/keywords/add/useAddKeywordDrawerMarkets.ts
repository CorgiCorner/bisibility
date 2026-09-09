"use client";

import type { NewMarketCreatorProps } from "@/components/markets/sheet/NewMarketCreator";
import type { NewMarketScheduleOption } from "@/components/markets/sheet/NewMarketSchedule";
import { createProjectMarket } from "@/lib/actions/project-market-create";
import type { NewMarketCreateResult } from "@/lib/markets/create-input";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDevice } from "@/lib/serp/constants";
import type { ComponentProps } from "react";
import { type Dispatch, type SetStateAction, useState } from "react";
import type { AddKeywordTrackingControls } from "./AddKeywordTrackingControls";
import { assignableSchedules, createdDrawerMarket } from "./add-keyword-drawer-markets";

type MatrixSelection = { devices: SerpDevice[]; locationKeys: string[] };

type DrawerMarketsArgs = {
  costContext?: ProjectCostContext;
  markets: ProjectMarketsView;
  projectId: string;
  selection: MatrixSelection;
  setSelection: Dispatch<SetStateAction<MatrixSelection>>;
};

/**
 * Everything the Add keywords drawer needs to offer, create and select a market: the markets it can
 * show (the project's plus the ones this session created), the schedules a row can be assigned to,
 * and the nested New market step.
 */
export function useAddKeywordDrawerMarkets({
  costContext,
  markets,
  projectId,
  selection,
  setSelection,
}: DrawerMarketsArgs) {
  const [created, setCreated] = useState<ProjectMarketsView["markets"]>([]);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [createdSchedules, setCreatedSchedules] = useState<NewMarketScheduleOption[]>([]);
  const availableSchedules = [
    ...(markets.marketCreation?.schedules ?? []),
    ...createdSchedules.filter(
      (created) =>
        !markets.marketCreation?.schedules.some((schedule) => schedule.id === created.id),
    ),
  ];
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scheduleStep = {
    open: scheduleOpen,
    start: () => setScheduleOpen(true),
    close: () => setScheduleOpen(false),
    onSaved: (schedule: {
      publicId: string;
      name: string;
      frequency: string;
      isDefault: boolean;
    }) => {
      setCreatedSchedules((current) => [...current, { ...schedule, id: schedule.publicId }]);
      setScheduleId(schedule.publicId);
      setScheduleOpen(false);
    },
  };
  const [marketOpen, setMarketOpen] = useState(false);
  const step = {
    open: marketOpen,
    start: () => setMarketOpen(true),
    close: () => setMarketOpen(false),
  };
  function onCreated(result: NewMarketCreateResult) {
    setCreated((current) => [
      ...current.filter((item) => item.id !== result.publicId),
      createdDrawerMarket(result),
    ]);
    setSelection((current) => ({
      devices: current.devices,
      locationKeys: [...new Set([...current.locationKeys, result.canonicalKey])],
    }));
  }
  const newMarkets = created.filter(
    (item) => !markets.markets.some((market) => market.id === item.id),
  );
  const selectable = [...markets.markets, ...newMarkets];
  const creator: Omit<NewMarketCreatorProps, "children"> = {
    onClose: step.close,
    onCreate: createProjectMarket,
    onCreated,
    onScheduleCreated: (schedule) => setCreatedSchedules((current) => [...current, schedule]),
    projectId,
    registry: [
      ...(markets.marketCreation?.registry ?? []),
      ...newMarkets.map((market) => ({
        canonicalKey: market.canonicalKey,
        id: market.id,
        status: "active" as const,
      })),
    ],
    schedules: availableSchedules,
    scheduleContext: markets.marketCreation?.scheduleContext
      ? {
          ...markets.marketCreation.scheduleContext,
          defaultScheduleName:
            [...createdSchedules].reverse().find((schedule) => schedule.isDefault)?.name ??
            markets.marketCreation.scheduleContext.defaultScheduleName,
        }
      : undefined,
    sources: [
      ...(markets.marketCreation?.sources ?? []),
      ...newMarkets.map((market) => ({
        id: market.id,
        keywordCount: market.keywordCount ?? 0,
        name: market.displayName,
      })),
    ],
  };

  const schedules = assignableSchedules(availableSchedules, costContext?.costPerCheckCents);

  return {
    creator,
    reset: () => {
      setCreated([]);
      step.close();
      scheduleStep.close();
    },
    scheduleId,
    scheduleStep,
    schedules,
    setScheduleId,
    step,
    /** Props for the manual panel's tracking controls, for the keyword count it would create. */
    tracking: (
      keywordCount: number,
      onChange: (value: MatrixSelection) => void,
    ): ComponentProps<typeof AddKeywordTrackingControls> => ({
      devices: selection.devices,
      fixed: keywordCount * selection.locationKeys.length * selection.devices.length,
      keywordCount,
      locationKeys: selection.locationKeys,
      markets: selectable,
      onChange,
      onNewMarket: markets.marketCreation ? step.start : undefined,
      onScheduleChange: setScheduleId,
      onNewSchedule: markets.marketCreation?.scheduleContext ? scheduleStep.start : undefined,
      scheduleId,
      schedules,
    }),
  };
}
