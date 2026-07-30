"use client";

import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { MenuSelect, SegmentedControl } from "@/components/ui";
import { fieldClass } from "@/lib/keywords/add-keyword-drawer-shared";
import { type SerpDevice, serpDeviceOptions } from "@/lib/serp/markets";
import type { RankCheckFrequency } from "@/lib/settings/options";

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

const deviceOptions = serpDeviceOptions.map((option) => ({
  label: option.label,
  value: option.value,
}));
const scheduleOptions = (projectDefault: RankCheckFrequency) => [
  {
    label: `Project default, ${projectDefault.replace("_", " ")}`,
    value: "project_default",
  },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Manual", value: "manual" },
  { label: "Paused", value: "paused" },
];

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
  return (
    <div className="grid grid-cols-1 gap-2.5">
      <LocationField
        error={locationError}
        idPrefix={idPrefix}
        labelHidden={labelsHidden}
        onChange={onLocationChange}
        projectId={projectId}
        value={location}
      />
      <div className={showSchedule ? "grid gap-2 sm:grid-cols-2" : "sm:max-w-[220px]"}>
        <SegmentedControl
          ariaLabel="Device"
          onChange={onDeviceChange}
          options={deviceOptions}
          size="field"
          value={device}
        />
        {showSchedule && onScheduleChange ? (
          <div className="flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.4px] text-fg-faint">
            <span className={labelsHidden ? "sr-only" : undefined}>Schedule</span>
            <MenuSelect
              ariaLabel="Schedule"
              onChange={(value) => onScheduleChange(value as TrackingScheduleSelection)}
              options={scheduleOptions(projectDefaultFrequency)}
              triggerClassName={`${fieldClass} justify-between normal-case tracking-normal`}
              value={scheduleFrequency}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
