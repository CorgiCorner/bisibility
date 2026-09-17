"use client";

import { MarketChips } from "@/components/markets/blocks/MarketChips";
import {
  ScheduleAssignment,
  type ScheduleAssignmentSchedule,
} from "@/components/markets/blocks/ScheduleAssignment";
import { languageDisplayName, regionDisplayName } from "@/lib/i18n/display-names";
import { fieldLabelClass, fieldMetaClass } from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDevice } from "@/lib/serp/constants";
import { useLocale, useTranslations } from "next-intl";
import { AddKeywordDeviceChips } from "./AddKeywordDeviceChips";

export type AddKeywordTrackingMarket = ProjectMarketsView["markets"][number];

type AddKeywordTrackingControlsProps = {
  devices: readonly SerpDevice[];
  /** Rows this submission would create: keywords x markets x devices. */
  fixed: number;
  /** Distinct keywords typed, which the schedule sentence must not confuse with rows. */
  keywordCount: number;
  locationKeys: readonly string[];
  markets: readonly AddKeywordTrackingMarket[];
  onChange: (value: { devices: SerpDevice[]; locationKeys: string[] }) => void;
  onNewMarket?: () => void;
  onScheduleChange: (scheduleId: string | null) => void;
  onNewSchedule?: () => void;
  scheduleId: string | null;
  schedules: readonly ScheduleAssignmentSchedule[];
  showSchedule?: boolean;
};

/** The stored labels are English; the chip reads the viewer's own country and language names. */
function marketLabel(market: AddKeywordTrackingMarket, locale: string) {
  const location = regionDisplayName(market.countryCode, market.displayName, locale);
  const language = languageDisplayName(market.languageCode, market.languageLabel, locale);
  return `${location} / ${language}`;
}

export function AddKeywordTrackingControls({
  devices,
  fixed,
  keywordCount,
  locationKeys,
  markets,
  onChange,
  onNewMarket,
  onScheduleChange,
  onNewSchedule,
  scheduleId,
  schedules,
  showSchedule = true,
}: Readonly<AddKeywordTrackingControlsProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.add");
  const locale = useLocale();
  const selectedIds = markets
    .filter((market) => locationKeys.includes(market.canonicalKey))
    .map((market) => market.id);

  function selectMarkets(ids: readonly string[]) {
    onChange({
      devices: [...devices],
      locationKeys: markets
        .filter((market) => ids.includes(market.id))
        .map((market) => market.canonicalKey),
    });
  }

  return (
    <>
      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <span className={fieldLabelClass}>{t("markets")}</span>
          <span className={fieldMetaClass}>{t("required")}</span>
        </div>
        {markets.length > 0 ? null : (
          <p className="m-0 text-[12px] text-fg-muted">{t("startWithMarket")}</p>
        )}
        <MarketChips
          capability="selection"
          markets={markets.map((market) => ({
            id: market.id,
            label: marketLabel(market, locale),
            researchAvailable: market.researchAvailable,
            status: market.status,
          }))}
          onChange={selectMarkets}
          onNew={onNewMarket}
          selected={selectedIds}
        />
      </div>
      {markets.some(
        (market) => market.status === "paused" && locationKeys.includes(market.canonicalKey),
      ) ? (
        <p className="m-0 text-[12px] text-fg-muted" role="status">
          {t("pausedMarketsHint")}
        </p>
      ) : null}
      <AddKeywordDeviceChips
        devices={devices}
        onChange={(next) => onChange({ devices: next, locationKeys: [...locationKeys] })}
      />
      {showSchedule ? (
        <ScheduleAssignment
          fixed={fixed}
          keywordCount={keywordCount}
          onChange={onScheduleChange}
          onNewSchedule={onNewSchedule}
          schedules={schedules}
          selectedId={scheduleId}
        />
      ) : null}
    </>
  );
}
