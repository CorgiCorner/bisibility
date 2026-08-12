"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { OnboardingFlowState } from "@/components/onboarding/onboarding-fixtures";
import { MenuMultiSelect, MenuSelect } from "@/components/ui";
import { type SerpDepth, type SerpDevice, serpDeviceOptions } from "@/lib/serp/markets";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { frequencyOptions, type RankCheckFrequency } from "@/lib/settings/options";
import { LocationSelectionChips } from "./LocationSelectionChips";
import {
  DerivedValue,
  deviceSummary,
  languagesForLocations,
  MenuField,
  SerpDepthField,
  SerpDepthWarning,
} from "./StepScheduleFields";

const selectTriggerClass =
  "min-h-0 min-w-0 justify-end border-0 bg-transparent px-0 text-right text-sm hover:border-transparent focus-visible:border-transparent";
const deviceOptions = serpDeviceOptions.map((option) => ({
  label: option.label,
  value: option.value,
}));
const refreshOptions = frequencyOptions
  .filter((option) => option.value !== "custom_cron")
  .map((option) => ({ label: option.label, value: option.value }));

type TrackingDefaultsFieldsProps = {
  devices: SerpDevice[];
  errors?: { devices?: string; frequency?: string; locations?: string };
  flowState?: OnboardingFlowState;
  frequency: RankCheckFrequency;
  initialDepth: SerpDepth;
  locations: LocationFieldValue[];
  onDepthChange: (depth: SerpDepth) => void;
  onDevicesChange: (devices: SerpDevice[]) => void;
  onFrequencyChange: (frequency: RankCheckFrequency) => void;
  onLocationsChange: (locations: LocationFieldValue[]) => void;
  serpDepth: SerpDepth;
};

export function TrackingDefaultsFields({
  devices,
  errors,
  flowState,
  frequency,
  initialDepth,
  locations,
  onDepthChange,
  onDevicesChange,
  onFrequencyChange,
  onLocationsChange,
  serpDepth,
}: Readonly<TrackingDefaultsFieldsProps>) {
  return (
    <section className="mt-6 border-border border-t pt-5">
      <h3 className="m-0 text-[15px] font-semibold text-fg">Tracking defaults</h3>
      <p className="m-0 mt-1 text-[12.5px] text-fg-muted">
        Applied to these keywords. You can change each keyword later.
      </p>
      <div className="mt-4 grid max-w-[560px] items-start gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <LocationSelectionChips
            error={errors?.locations}
            onChange={onLocationsChange}
            projectId={flowState?.projectId}
            values={locations}
          />
        </div>
        <DerivedValue
          help="Derived from the selected locations."
          label="Language"
          value={languagesForLocations(locations)}
        />
        <MenuField help={FIELD_HELP.device} label="Devices">
          <MenuMultiSelect
            ariaLabel="Devices"
            onChange={(values) => onDevicesChange(values as SerpDevice[])}
            options={deviceOptions}
            summary={deviceSummary}
            triggerClassName={selectTriggerClass}
            values={devices}
          />
        </MenuField>
        <div>
          <SerpDepthField
            depth={serpDepth}
            onChange={onDepthChange}
            triggerClassName={selectTriggerClass}
          />
          <SerpDepthWarning currentDepth={serpDepth} initialDepth={initialDepth} />
        </div>
        <MenuField help={FIELD_HELP.frequency} label="Refresh">
          <MenuSelect
            ariaLabel="Refresh"
            onChange={(value) => onFrequencyChange(value as RankCheckFrequency)}
            options={refreshOptions}
            triggerClassName={selectTriggerClass}
            value={frequency}
          />
        </MenuField>
      </div>
      <p className="m-0 mt-3 text-[11.5px] text-fg-muted">
        More locations or devices create more provider checks.
      </p>
      {errors?.devices ? (
        <p className="m-0 mt-2 text-[12px] text-red-text">{errors.devices}</p>
      ) : null}
      {errors?.frequency ? (
        <p className="m-0 mt-2 text-[12px] text-red-text">{errors.frequency}</p>
      ) : null}
    </section>
  );
}
