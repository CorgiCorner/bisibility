"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { MenuMultiSelect } from "@/components/ui/MenuSelect";
import { type SerpDepth, type SerpDevice, serpDeviceValues } from "@/lib/serp/constants";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { useTranslations } from "next-intl";
import { OnboardingMarketDefinition } from "./OnboardingMarketDefinition";
import type { CreateOnboardingMarketAction } from "./onboarding-market-actions";
import { deviceSummary, MenuField, SerpDepthField } from "./StepScheduleFields";

const selectTriggerClass =
  "min-h-0 min-w-0 justify-end border-0 bg-transparent px-0 text-right text-sm hover:border-transparent focus-visible:border-transparent";
type TrackingDefaultsFieldsProps = {
  createMarketAction?: CreateOnboardingMarketAction;
  devices: SerpDevice[];
  errors?: { devices?: string; locations?: string };
  locations: LocationFieldValue[];
  onDepthChange: (depth: SerpDepth) => void;
  onDevicesChange: (devices: SerpDevice[]) => void;
  onLocationsChange: (locations: LocationFieldValue[]) => void;
  projectId: string;
  serpDepth: SerpDepth;
};

export function TrackingDefaultsFields({
  createMarketAction,
  devices,
  errors,
  locations,
  onDepthChange,
  onDevicesChange,
  onLocationsChange,
  projectId,
  serpDepth,
}: Readonly<TrackingDefaultsFieldsProps>) {
  const t = useTranslations("onboarding.tracking");
  const deviceNames = useTranslations("shared.markets");
  const deviceOptions = serpDeviceValues.map((device) => ({
    label: deviceNames(device),
    value: device,
  }));
  return (
    <section className="mt-6 border-border border-t pt-5" data-analytics-mask>
      <h3 className="m-0 text-[15px] font-semibold text-fg">{t("title")}</h3>
      <p className="m-0 mt-1 text-[12.5px] text-fg-muted">{t("description")}</p>
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
          <MenuField help={FIELD_HELP.device} label={t("devices")}>
            <MenuMultiSelect
              analytics={{ control: "onboarding.tracking_devices" }}
              ariaLabel={t("devices")}
              onChange={(values) => onDevicesChange(values as SerpDevice[])}
              options={deviceOptions}
              summary={(selected) => deviceSummary(selected, t)}
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
        </div>
      </div>
      <p className="m-0 mt-3 text-[11.5px] text-fg-muted">{t("moreChecks")}</p>
      {errors?.devices ? (
        <p className="m-0 mt-2 text-[12px] text-red-text">{errors.devices}</p>
      ) : null}
    </section>
  );
}
