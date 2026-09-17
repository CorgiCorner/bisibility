"use client";

import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { fieldClass } from "@/lib/keywords/add-keyword-drawer-shared";
import { type SerpDevice, serpDeviceOptions } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { useTranslations } from "next-intl";

export type TrackingScheduleSelection = RankCheckFrequency | "project_default";

export type TrackingConfigurationValue = {
  device: SerpDevice;
  location: LocationFieldValue;
  scheduleFrequency: TrackingScheduleSelection;
};

type TrackingConfigurationFieldsProps = TrackingConfigurationValue & {
  idPrefix?: string;
  /** Keep the Location and Schedule labels for screen readers only - for compact layouts. */
  labelsHidden?: boolean;
  locationError?: string;
  onDeviceChange: (value: SerpDevice) => void;
  onLocationChange: (value: LocationFieldValue) => void;
  onScheduleChange?: (value: TrackingScheduleSelection) => void;
  projectDefaultFrequency?: RankCheckFrequency;
  projectId?: string | null;
  showSchedule?: boolean;
};

const scheduleKeys = {
  custom_cron: "scheduleCustomCron",
  daily: "scheduleDaily",
  manual: "scheduleManual",
  monthly: "scheduleMonthly",
  paused: "schedulePaused",
  weekly: "scheduleWeekly",
} as const;

export function TrackingConfigurationFields({
  device,
  idPrefix = "tracking",
  labelsHidden = false,
  location,
  locationError,
  onDeviceChange,
  onLocationChange,
  onScheduleChange,
  projectDefaultFrequency = "manual",
  projectId = null,
  scheduleFrequency,
  showSchedule = false,
}: Readonly<TrackingConfigurationFieldsProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.add");
  const deviceOptions = serpDeviceOptions.map((option) => ({
    label: t(option.value === "desktop" ? "deviceDesktop" : "deviceMobile"),
    value: option.value,
  }));
  const localizedScheduleOptions = [
    {
      label: t("projectDefaultSchedule", { frequency: t(scheduleKeys[projectDefaultFrequency]) }),
      value: "project_default",
    },
    ...Object.entries(scheduleKeys).map(([value, key]) => ({ label: t(key), value })),
  ];
  const locationMessages = {
    city: t("locationCity"),
    clearSearch: t("locationClearSearch"),
    countries: t("locationCountries"),
    noMatching: t("locationNoMatching"),
    region: t("locationRegion"),
    regionsAndCities: t("locationRegionsAndCities"),
    searching: t("locationSearching"),
  };
  return (
    <div className="grid grid-cols-1 gap-2.5">
      <LocationField
        error={locationError}
        idPrefix={idPrefix}
        label={t("locationLabel")}
        labelHidden={labelsHidden}
        messages={locationMessages}
        onChange={onLocationChange}
        projectId={projectId}
        placeholder={t("locationPlaceholder")}
        value={location}
      />
      <div className={showSchedule ? "grid gap-2 sm:grid-cols-2" : "sm:max-w-[220px]"}>
        <SegmentedControl
          ariaLabel={t("deviceAria")}
          onChange={onDeviceChange}
          options={deviceOptions}
          size="field"
          value={device}
        />
        {showSchedule && onScheduleChange ? (
          <div className="flex flex-col gap-1.5 font-sans tabular-nums text-[10px] uppercase tracking-[0.4px] text-fg-muted">
            <span className={labelsHidden ? "sr-only" : undefined}>{t("scheduleAria")}</span>
            <MenuSelect
              ariaLabel={t("scheduleAria")}
              onChange={(value) => onScheduleChange(value as TrackingScheduleSelection)}
              options={localizedScheduleOptions}
              triggerClassName={`${fieldClass} justify-between normal-case tracking-normal`}
              value={scheduleFrequency}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
