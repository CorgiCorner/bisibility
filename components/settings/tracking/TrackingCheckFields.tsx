import {
  countryForSelection,
  initialLocationValue,
} from "@/components/keywords/add/AddKeywordDrawerLocation";
import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import type { TrackingDefaultsForm } from "@/components/settings/tracking/tracking-form";
import { FieldLabel, MenuSelect, Switch } from "@/components/ui";
import { type SerpDepth, serpDepthValues, serpDeviceOptions } from "@/lib/serp/markets";
import type { DefaultsData } from "@/lib/settings/options";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";

const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const triggerClass =
  "min-h-10 w-full justify-between rounded-[9px] border-border-strong bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";
const deviceOptions = serpDeviceOptions.map((option) => ({ ...option }));
const depthOptions = serpDepthValues.map((depth) => ({
  label: `Top ${depth}`,
  value: String(depth),
}));

type TrackingCheckFieldsProps = {
  canEdit: boolean;
  defaults: DefaultsData;
  domain: string | null;
  form: UseFormReturn<TrackingDefaultsForm>;
  markDirty: () => void;
};

export function TrackingCheckFields({
  canEdit,
  defaults,
  domain,
  form,
  markDirty,
}: Readonly<TrackingCheckFieldsProps>) {
  const device = form.watch("device");
  const depth = form.watch("serpDepth") ?? defaults.serpDepth;
  const [location, setLocation] = useState<LocationFieldValue>(() =>
    defaults.city && defaults.locationKey
      ? {
          canonicalKey: defaults.locationKey,
          cityName: defaults.city,
          countryCode: defaults.locationKey.split("/")[0] ?? "",
          displayName: defaults.locationLabel,
          kind: "city",
          regionName: null,
        }
      : initialLocationValue(defaults.country),
  );

  function setDefaultLocation(value: LocationFieldValue) {
    setLocation(value);
    form.setValue("country", countryForSelection(value) as TrackingDefaultsForm["country"], {
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
    markDirty();
  }

  function setDevice(value: string) {
    form.setValue("device", value as TrackingDefaultsForm["device"], {
      shouldDirty: true,
      shouldValidate: true,
    });
    markDirty();
  }

  function setDepth(value: string) {
    form.setValue("serpDepth", Number(value) as SerpDepth, {
      shouldDirty: true,
      shouldValidate: true,
    });
    markDirty();
  }

  return (
    <div className="space-y-4 border-t border-border-soft pt-4">
      <input type="hidden" {...form.register("projectId")} />
      <input type="hidden" {...form.register("city")} />
      <input type="hidden" {...form.register("country")} />
      <input type="hidden" {...form.register("locationKey")} />
      <SettingsField width="md">
        <LocationField
          disabled={!canEdit}
          help="One project-wide default. Typing filters countries and available city locations."
          idPrefix="tracking-default"
          label="Location"
          onChange={setDefaultLocation}
          projectId={form.getValues("projectId")}
          value={location}
        />
      </SettingsField>

      <SettingsField width="sm">
        <FieldLabel className={labelClass} label="Device" />
        <input type="hidden" {...form.register("device")} />
        <MenuSelect
          ariaLabel="Device"
          onChange={setDevice}
          options={deviceOptions}
          triggerClassName={`${triggerClass} mt-1.5`}
          value={device}
        />
        <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
          Desktop and mobile checks keep separate history.
        </p>
      </SettingsField>

      <SettingsField width="sm">
        <FieldLabel className={labelClass} label="Default SERP depth" />
        <input type="hidden" {...form.register("serpDepth", { valueAsNumber: true })} />
        <MenuSelect
          ariaLabel="Default SERP depth"
          onChange={setDepth}
          options={depthOptions}
          triggerClassName={`${triggerClass} mt-1.5`}
          value={String(depth)}
        />
        <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
          How far down each result page a check reads.
        </p>
        {depth < defaults.serpDepth ? (
          <p className="m-0 mt-2 text-[11.5px] leading-5 text-yellow-text">
            From the next check, keywords ranking past {depth} record as not found instead of their
            position. That gap stays in history.
          </p>
        ) : null}
      </SettingsField>

      <SettingsField width="full">
        <Controller
          control={form.control}
          name="serpStopOnMatch"
          render={({ field }) => (
            <Switch
              aria-label="Stop checks at first domain match"
              checked={field.value}
              className="w-full"
              description={`On stops reading when ${domain ?? "the project domain"} first appears, recording the best position. Off reads the full configured depth.`}
              disabled={!canEdit}
              label="Stop checks at first domain match"
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(event.target.checked)}
              ref={field.ref}
            />
          )}
        />
      </SettingsField>
    </div>
  );
}
