"use client";

import {
  countryForSelection,
  initialLocationValue,
} from "@/components/keywords/add/AddKeywordDrawerLocation";
import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { SettingsSection } from "@/components/settings/SettingsSection";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, MenuSelect, Switch } from "@/components/ui";
import { updateDefaultRankCheckSettings } from "@/lib/actions/settings";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import { serpDepthDecreaseWarning } from "@/lib/schemas/serp-depth";
import {
  DEFAULT_SERP_DEPTH,
  resolveSerpStopOnMatch,
  type SerpDepth,
  serpDepthValues,
  serpDeviceOptions,
} from "@/lib/serp/markets";
import type { DefaultsData } from "@/lib/settings/options";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { RankCheckFrequency } from "./RankCheckFrequency";

export type DefaultsForm = z.infer<typeof projectDefaultsSchema>;

export type DefaultsSectionProps = {
  canEdit: boolean;
  defaults: DefaultsData;
  projectId?: string;
  updateSchedule?: (input: DefaultsForm) => Promise<unknown>;
};

const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";
const selectTriggerClass =
  "min-h-10 w-full justify-between rounded-lg border-border-strong bg-bg-sunken px-3 text-[13px] font-medium normal-case tracking-normal";
const feedbackClass = "text-[11.5px] font-medium normal-case tracking-normal";
const depthSelectOptions = serpDepthValues.map((depth) => ({
  label: `Top ${depth}`,
  value: String(depth),
}));

function savedSerpDepth(defaults: DefaultsData) {
  return defaults.serpDepth ?? DEFAULT_SERP_DEPTH;
}

function resultWarning(result: unknown) {
  if (!result || typeof result !== "object" || !("warning" in result)) return null;
  const warning = (result as { warning?: unknown }).warning;
  return typeof warning === "string" && warning.trim() ? warning : null;
}

function formDefaults(defaults: DefaultsData, projectId = "story_project"): DefaultsForm {
  const frequency = defaults.schedule.frequency;
  const location = defaultLocation(defaults);

  return {
    city: location.kind === "city" ? location.displayName : null,
    country: countryForSelection(location) as DefaultsForm["country"],
    cronExpression: defaults.schedule.cron_expression ?? "0 6 * * *",
    device: defaults.device.toLowerCase() === "mobile" ? "mobile" : "desktop",
    frequency,
    jitterMinutes: defaults.schedule.jitter_minutes,
    locationKey: location.canonicalKey,
    projectId,
    serpDepth: savedSerpDepth(defaults),
    serpStopOnMatch: resolveSerpStopOnMatch(defaults.serpStopOnMatch),
    timezone: defaults.schedule.timezone,
  };
}

function defaultLocation(defaults: DefaultsData): LocationFieldValue {
  if (defaults.city && defaults.locationKey) {
    return {
      canonicalKey: defaults.locationKey,
      cityName: defaults.city,
      countryCode: defaults.locationKey.split("/")[0] ?? "",
      displayName: defaults.locationLabel,
      kind: "city",
      regionName: null,
    };
  }
  return initialLocationValue(defaults.country);
}

export function DefaultsSection({
  canEdit,
  defaults,
  projectId,
  updateSchedule,
}: Readonly<DefaultsSectionProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<DefaultsForm>({
    resolver: zodResolver(projectDefaultsSchema),
    defaultValues: formDefaults(defaults, projectId),
    mode: "onChange",
  });
  const errors = form.formState.errors;
  const [locationValue, setLocationValue] = useState(() => defaultLocation(defaults));
  const { readOnly } = useProjectWriteMode();
  const device = form.watch("device");
  const serpDepth = form.watch("serpDepth");
  const initialSerpDepth = savedSerpDepth(defaults);
  const deviceSelectOptions = serpDeviceOptions.map((option) => ({
    label: option.label,
    value: option.value,
  }));

  function setLocation(value: LocationFieldValue) {
    setLocationValue(value);
    form.setValue("country", countryForSelection(value) as DefaultsForm["country"], {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("city", value.kind === "city" ? value.displayName : null, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("locationKey", value.canonicalKey, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function setDevice(value: string) {
    form.setValue("device", value as DefaultsForm["device"], {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function setSerpDepth(value: string) {
    form.setValue("serpDepth", Number(value) as SerpDepth, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function onSubmit(values: DefaultsForm) {
    if (!canEdit || !projectId || readOnly) {
      return;
    }

    const nextValues = { ...values, projectId };
    const saveDefaults = updateSchedule ?? updateDefaultRankCheckSettings;
    setMessage(null);
    startTransition(() => {
      void saveDefaults(nextValues)
        .then((result) => {
          form.reset(nextValues);
          setMessage(resultWarning(result) ?? "Defaults saved.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Defaults could not be saved.")),
        );
    });
  }

  return (
    <SettingsSection
      action={
        projectId ? (
          <ProjectReadOnlyTooltip>
            <Button
              disabled={!canEdit || readOnly || !form.formState.isDirty}
              form="defaults-form"
              loading={isPending}
              loadingLabel="Saving"
              size="sm"
              type="submit"
            >
              Save
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null
      }
      description="Applied to new keywords unless overridden. Schedule changes affect provider usage and alert freshness, not dashboard refresh."
      title="Defaults"
    >
      <form className="space-y-4" id="defaults-form" onSubmit={form.handleSubmit(onSubmit)}>
        <fieldset className="contents" disabled={!canEdit}>
          <input type="hidden" {...form.register("projectId")} />
          <input type="hidden" {...form.register("city")} />
          <input type="hidden" {...form.register("country")} />
          <input type="hidden" {...form.register("locationKey")} />
          <RankCheckFrequency defaults={defaults} form={form} projectId={projectId} />
          <div className="border-t border-border-soft pt-4">
            <div className="max-w-[240px]">
              <label className={labelClass}>
                <span>Default SERP depth</span>
                <input type="hidden" {...form.register("serpDepth")} />
                <MenuSelect
                  ariaLabel="Default SERP depth"
                  onChange={setSerpDepth}
                  options={depthSelectOptions}
                  triggerClassName={selectTriggerClass}
                  value={String(serpDepth)}
                />
              </label>
              {serpDepth < initialSerpDepth ? (
                <p className={cn("m-0 mt-2", feedbackClass, "text-yellow")}>
                  {serpDepthDecreaseWarning(serpDepth)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="border-t border-border-soft pt-4">
            <Controller
              control={form.control}
              name="serpStopOnMatch"
              render={({ field }) => (
                <Switch
                  aria-label="Stop checks at first domain match"
                  checked={field.value}
                  className="w-full"
                  description="On (default): checks stop as soon as your domain is found - cheaper, but the stored SERP snapshot is truncated. Off: always fetch the full configured depth for complete competitor snapshots."
                  disabled={readOnly}
                  label="Stop checks at first domain match"
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(event.target.checked)}
                  ref={field.ref}
                />
              )}
            />
          </div>
          <div className="border-t border-border-soft pt-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
                Default market
              </div>
              <p className="mt-1 text-[12.5px] text-fg-muted">
                Applied to new keywords unless overridden.
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <LocationField
                  error={errors.country?.message ?? errors.locationKey?.message}
                  idPrefix="settings-default"
                  label="Default location"
                  onChange={setLocation}
                  projectId={projectId}
                  value={locationValue}
                />
                {errors.country ? (
                  <span className={cn(feedbackClass, "text-red")}>{errors.country.message}</span>
                ) : null}
              </div>
              <div className={labelClass}>
                <span>Default device</span>
                <input type="hidden" {...form.register("device")} />
                <MenuSelect
                  ariaLabel="Default device"
                  onChange={setDevice}
                  options={deviceSelectOptions}
                  triggerClassName={selectTriggerClass}
                  value={device}
                />
                {errors.device ? (
                  <span className={cn(feedbackClass, "text-red")}>{errors.device.message}</span>
                ) : null}
              </div>
            </div>
          </div>
          {message ? <span className={cn(feedbackClass, "text-fg-muted")}>{message}</span> : null}
        </fieldset>
      </form>
    </SettingsSection>
  );
}
