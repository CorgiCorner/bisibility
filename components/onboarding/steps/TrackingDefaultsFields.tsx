"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { MenuMultiSelect, MenuSelect } from "@/components/ui/MenuSelect";
import { type SerpDepth, type SerpDevice, serpDeviceOptions } from "@/lib/serp/constants";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { frequencyOptions, type RankCheckFrequency } from "@/lib/settings/options";
import { OnboardingMarketDefinition } from "./OnboardingMarketDefinition";
import type { CreateOnboardingMarketAction } from "./onboarding-market-actions";
import { deviceSummary, MenuField, SerpDepthField } from "./StepScheduleFields";

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
  createMarketAction?: CreateOnboardingMarketAction;
  devices: SerpDevice[];
  errors?: { devices?: string; frequency?: string; locations?: string };
  frequency: RankCheckFrequency;
  locations: LocationFieldValue[];
  onDepthChange: (depth: SerpDepth) => void;
  onDevicesChange: (devices: SerpDevice[]) => void;
  onFrequencyChange: (frequency: RankCheckFrequency) => void;
  onLocationsChange: (locations: LocationFieldValue[]) => void;
  projectId: string;
  serpDepth: SerpDepth;
};

export function TrackingDefaultsFields({
  createMarketAction,
  devices,
  errors,
  frequency,
  locations,
  onDepthChange,
  onDevicesChange,
  onFrequencyChange,
  onLocationsChange,
  projectId,
  serpDepth,
}: Readonly<TrackingDefaultsFieldsProps>) {
  return (
    <section className="mt-6 border-border border-t pt-5" data-analytics-mask>
      <h3 className="m-0 text-[15px] font-semibold text-fg">Tracking defaults</h3>
      <p className="m-0 mt-1 text-[12.5px] text-fg-muted">
        Applied to these keywords. You can change each keyword later.
      </p>
      <div className="mt-4 max-w-[560px]">
        <OnboardingMarketDefinition
          createMarketAction={createMarketAction}
          devices={devices}
          error={errors?.locations}
          onChange={onLocationsChange}
          projectId={projectId}
          values={locations}
        />
        <div className="mt-3 grid items-start gap-3 sm:grid-cols-2">
          <MenuField help={FIELD_HELP.device} label="Devices">
            <MenuMultiSelect
              analytics={{ control: "onboarding.tracking_devices" }}
              ariaLabel="Devices"
              onChange={(values) => onDevicesChange(values as SerpDevice[])}
              options={deviceOptions}
              summary={deviceSummary}
              triggerClassName={selectTriggerClass}
              values={devices}
            />
          </MenuField>
          <SerpDepthField
            analytics={{ control: "onboarding.tracking_depth" }}
            depth={serpDepth}
            onChange={onDepthChange}
            triggerClassName={selectTriggerClass}
          />
          <MenuField help={FIELD_HELP.frequency} label="Frequency">
            <MenuSelect
              analytics={{ control: "onboarding.tracking_frequency" }}
              ariaLabel="Frequency"
              onChange={(value) => onFrequencyChange(value as RankCheckFrequency)}
              options={refreshOptions}
              triggerClassName={selectTriggerClass}
              value={frequency}
            />
          </MenuField>
        </div>
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
