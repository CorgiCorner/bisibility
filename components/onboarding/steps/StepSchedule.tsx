"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import {
  actionErrorMessage,
  displayProvider,
  feedbackClass,
  onboardingFormId,
  trackingDefaults,
} from "@/components/onboarding/onboarding-form-utils";
import {
  countryNameForLocationValue,
  locationValueForKey,
  locationValuesForKeys,
} from "@/components/onboarding/onboarding-location-field";
import { DEFAULT_ONBOARDING_LOCATION_KEY } from "@/components/onboarding/onboarding-locations";
import { MenuMultiSelect, MenuSelect } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { DEFAULT_SERP_DEVICE, type SerpDevice, serpDeviceOptions } from "@/lib/serp/markets";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { frequencyOptions } from "@/lib/settings/options";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LocationSelectionChips } from "./LocationSelectionChips";
import { StepScheduleEstimate } from "./StepScheduleEstimate";
import {
  DerivedValue,
  deviceSummary,
  languagesForLocations,
  MenuField,
  ReadonlyField,
  SerpDepthField,
  SerpDepthWarning,
} from "./StepScheduleFields";
import {
  type OnboardingTrackingDefaultsInput,
  onboardingTrackingDefaultsSchema,
  type TrackingDefaultsForm,
  withTrackingDefaults,
} from "./step-schedule-model";

export type { OnboardingTrackingDefaultsInput } from "./step-schedule-model";

const onboardingFrequencyOptions = frequencyOptions.filter(
  (option) => option.value !== "custom_cron",
);
const selectTriggerClass =
  "min-h-0 min-w-0 justify-end border-0 bg-transparent px-0 text-right text-[13.5px] hover:border-transparent focus-visible:border-transparent";
const deviceSelectOptions = serpDeviceOptions.map((option) => ({
  label: option.label,
  value: option.value,
}));
const frequencySelectOptions = onboardingFrequencyOptions.map((option) => ({
  label: option.label,
  value: option.value,
}));

type StepScheduleProps = {
  defaultValues?: ProjectDefaultsInput | OnboardingTrackingDefaultsInput;
  flowState?: OnboardingFlowState;
  onComplete?: (values: OnboardingTrackingDefaultsInput) => void;
  projectedCostPerCheckCents?: number | null;
  updateProjectDefaultsAction?: (input: ProjectDefaultsInput) => Promise<unknown>;
};

export function StepSchedule({
  defaultValues,
  flowState,
  onComplete,
  projectedCostPerCheckCents,
  updateProjectDefaultsAction,
}: Readonly<StepScheduleProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const formDefaults = withTrackingDefaults(defaultValues, flowState);
  const [selectedLocations, setSelectedLocations] = useState(() =>
    locationValuesForKeys(formDefaults.locations),
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<TrackingDefaultsForm>({
    defaultValues: formDefaults,
    resolver: zodResolver(onboardingTrackingDefaultsSchema),
  });
  const devices = watch("devices");
  const frequency = watch("frequency");
  const serpDepth = watch("serpDepth");
  const language = languagesForLocations(selectedLocations);

  function setLocations(next: LocationFieldValue[]) {
    setSelectedLocations(next);
    setValue(
      "locations",
      next.map((location) => location.canonicalKey),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function setDevices(next: string[]) {
    setValue("devices", next as SerpDevice[], {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function onSubmit(values: TrackingDefaultsForm) {
    setActionError(null);
    const locationSelections = values.locations.map((key) => {
      return (
        selectedLocations.find((location) => location.canonicalKey === key) ??
        locationValueForKey(key)
      );
    });
    const primaryLocation =
      locationSelections[0] ?? locationValueForKey(DEFAULT_ONBOARDING_LOCATION_KEY);
    const projectDefaults: ProjectDefaultsInput = {
      city: primaryLocation.kind === "city" ? primaryLocation.displayName : null,
      country: countryNameForLocationValue(primaryLocation),
      cronExpression: values.cronExpression,
      device: values.devices[0] ?? DEFAULT_SERP_DEVICE,
      frequency: values.frequency,
      jitterMinutes: values.jitterMinutes,
      locationKey: primaryLocation.canonicalKey,
      projectId: values.projectId,
      serpDepth: values.serpDepth,
      timezone: values.timezone,
    };
    const completedValues: OnboardingTrackingDefaultsInput = {
      ...values,
      ...projectDefaults,
      locationSelections,
    };

    if (!updateProjectDefaultsAction) {
      onComplete?.(completedValues);
      if (onComplete) return;
      router.push(
        buildOnboardingStepHref(5, {
          ...flowState,
          devices: values.devices,
          locations: values.locations,
        }),
      );
      return;
    }

    try {
      await updateProjectDefaultsAction(projectDefaults);
      onComplete?.(completedValues);
      if (onComplete) return;
      router.push(
        buildOnboardingStepHref(5, {
          ...flowState,
          devices: values.devices,
          locations: values.locations,
          projectId: values.projectId,
        }),
      );
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }

  return (
    <form id={onboardingFormId} onSubmit={handleSubmit(onSubmit)}>
      <input type="hidden" {...register("projectId")} />
      <input type="hidden" {...register("cronExpression")} />
      <input type="hidden" {...register("jitterMinutes")} />
      <input type="hidden" {...register("timezone")} />
      <div className="text-lg font-semibold tracking-[-0.4px]">Tracking defaults</div>
      <div className="mt-1 text-[13px] text-fg-muted">
        Applied to every new keyword. Override per keyword later.
      </div>

      <div className="mt-[22px] grid max-w-[480px] items-start gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
        <ReadonlyField
          label="Provider"
          name="provider"
          value={displayProvider(flowState?.providerId)}
        />
        <ReadonlyField
          help="Google is the only supported engine today; more are planned."
          label="Engine"
          name="engine"
          value={trackingDefaults.engine}
        />
        <div className="sm:col-span-2">
          <LocationSelectionChips
            error={errors.locations?.message}
            onChange={setLocations}
            projectId={flowState?.projectId}
            values={selectedLocations}
          />
        </div>
        <DerivedValue label="Language" value={language} />
        <MenuField help={FIELD_HELP.device} label="Devices">
          <MenuMultiSelect
            ariaLabel="Devices"
            onChange={setDevices}
            options={deviceSelectOptions}
            summary={deviceSummary}
            triggerClassName={selectTriggerClass}
            values={devices}
          />
        </MenuField>
        <div>
          <SerpDepthField
            depth={serpDepth}
            onChange={(depth) =>
              setValue("serpDepth", depth, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            triggerClassName={selectTriggerClass}
          />
          <SerpDepthWarning currentDepth={serpDepth} initialDepth={formDefaults.serpDepth} />
        </div>
        <MenuField help={FIELD_HELP.frequency} label="Refresh">
          <MenuSelect
            ariaLabel="Refresh"
            onChange={(value) =>
              setValue("frequency", value as TrackingDefaultsForm["frequency"], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            options={frequencySelectOptions}
            triggerClassName={selectTriggerClass}
            value={frequency}
          />
        </MenuField>
      </div>

      <div className="mt-3.5 text-[11.5px] text-fg-muted">
        More locations or devices create more provider checks.
      </div>
      <StepScheduleEstimate
        depth={serpDepth}
        deviceCount={devices.length}
        frequency={frequency}
        locationCount={selectedLocations.length}
        overrideCents={projectedCostPerCheckCents}
        providerId={flowState?.providerId}
      />
      {errors.devices ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{errors.devices.message}</p>
      ) : null}
      {errors.frequency ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{errors.frequency.message}</p>
      ) : null}
      {actionError ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{actionError}</p>
      ) : null}
      {isSubmitting ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-fg-muted`}>Saving defaults...</p>
      ) : null}
    </form>
  );
}
