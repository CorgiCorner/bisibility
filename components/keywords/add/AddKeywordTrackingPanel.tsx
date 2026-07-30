"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { AddKeywordDrawerForm } from "@/lib/keywords/add-keyword-drawer-shared";
import type { SerpDevice } from "@/lib/serp/markets";
import type { RankCheckFrequency } from "@/lib/settings/options";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import {
  TrackingConfigurationFields,
  type TrackingScheduleSelection,
} from "./TrackingConfigurationFields";

type AddKeywordTrackingPanelProps = {
  device: AddKeywordDrawerForm["device"];
  errors: FieldErrors<AddKeywordDrawerForm>;
  location: LocationFieldValue;
  onDeviceChange: (value: string) => void;
  onLocationChange: (value: LocationFieldValue) => void;
  projectId?: string | null;
  register: UseFormRegister<AddKeywordDrawerForm>;
  scheduleFrequency?: RankCheckFrequency | "project_default";
  showSchedule?: boolean;
  onScheduleChange?: (value: string) => void;
  projectDefaultFrequency?: RankCheckFrequency;
};

export function AddKeywordTrackingPanel({
  device,
  errors,
  location,
  onDeviceChange,
  onLocationChange,
  onScheduleChange,
  projectId = null,
  projectDefaultFrequency = "manual",
  register,
  scheduleFrequency = "project_default",
  showSchedule = false,
}: Readonly<AddKeywordTrackingPanelProps>) {
  return (
    <div>
      <div className="text-[12.5px] font-semibold text-fg">Tracking</div>
      <input type="hidden" {...register("device")} />
      <div className="mt-2">
        <TrackingConfigurationFields
          device={device}
          idPrefix="add-keyword-tracking"
          labelsHidden
          location={location}
          locationError={errors.locationKey?.message ?? errors.location?.message}
          onDeviceChange={(value: SerpDevice) => onDeviceChange(value)}
          onLocationChange={onLocationChange}
          onScheduleChange={
            onScheduleChange
              ? (value: TrackingScheduleSelection) => onScheduleChange(value)
              : undefined
          }
          projectDefaultFrequency={projectDefaultFrequency}
          projectId={projectId}
          scheduleFrequency={scheduleFrequency}
          showSchedule={showSchedule}
        />
      </div>
      <p className="mt-2 text-[11.5px] text-fg-faint">
        You pay your SERP provider per check. Optionally narrow to a city, or duplicate after adding
        for more devices/locations.
      </p>
    </div>
  );
}
