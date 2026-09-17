import {
  countryForSelection,
  initialLocationValue,
} from "@/components/keywords/add/AddKeywordDrawerLocation";
import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import type { TrackingDefaultsForm } from "@/components/settings/tracking/tracking-form";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Switch } from "@/components/ui/Switch";
import { type SerpDepth, serpDepthValues, serpDeviceOptions } from "@/lib/serp/constants";
import type { DefaultsData } from "@/lib/settings/options";
import { VISIBILITY_HORIZON, VISIBILITY_SHALLOW_CHECK_COPY } from "@/lib/visibility/definition";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";

const labelClass = "font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const triggerClass =
  "min-h-10 w-full justify-between rounded-control border-border-control bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";
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
  const t = useTranslations("projectSettingsTracking.checkDefaults");
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
  const deviceOptions = serpDeviceOptions.map((option) => ({
    ...option,
    label: option.value === "mobile" ? t("deviceMobile") : t("deviceDesktop"),
  }));
  const depthOptions = serpDepthValues.map((value) => ({
    label: t("depthOption", { depth: value }),
    value: String(value),
  }));

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
    <div className="space-y-4 border-t border-border pt-4">
      <input type="hidden" {...form.register("projectId")} />
      <input type="hidden" {...form.register("city")} />
      <input type="hidden" {...form.register("country")} />
      <input type="hidden" {...form.register("locationKey")} />
      <SettingsField className="scroll-mt-6" id="tracking-location" tabIndex={-1} width="field">
        <LocationField
          disabled={!canEdit}
          help={t("locationHelp")}
          idPrefix="tracking-default"
          label={t("location")}
          messages={{
            city: t("locationCity"),
            clearSearch: t("locationClearSearch"),
            countries: t("locationCountries"),
            noMatching: t("locationNoMatching"),
            region: t("locationRegion"),
            regionsAndCities: t("locationRegionsAndCities"),
            searching: t("locationSearching"),
          }}
          onChange={setDefaultLocation}
          projectId={form.getValues("projectId")}
          value={location}
        />
      </SettingsField>

      <SettingsField className="scroll-mt-6" id="tracking-device" tabIndex={-1} width="field">
        <FieldLabel className={labelClass} label={t("device")} />
        <input type="hidden" {...form.register("device")} />
        <MenuSelect
          ariaLabel={t("device")}
          onChange={setDevice}
          options={deviceOptions}
          triggerClassName={`${triggerClass} mt-1.5`}
          value={device}
        />
        <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">{t("deviceHelp")}</p>
      </SettingsField>

      <SettingsField className="scroll-mt-6" id="tracking-depth" tabIndex={-1} width="field">
        <FieldLabel className={labelClass} label={t("serpDepth")} />
        <input type="hidden" {...form.register("serpDepth", { valueAsNumber: true })} />
        <MenuSelect
          ariaLabel={t("serpDepth")}
          onChange={setDepth}
          options={depthOptions}
          triggerClassName={`${triggerClass} mt-1.5`}
          triggerTitle={depth < VISIBILITY_HORIZON ? VISIBILITY_SHALLOW_CHECK_COPY : undefined}
          triggerWrapperClassName="w-full"
          value={String(depth)}
        />
        <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">{t("serpDepthHelp")}</p>
        {depth < defaults.serpDepth ? (
          <p className="m-0 mt-2 text-[11.5px] leading-5 text-yellow-text">
            {t("serpDepthWarning", { depth })}
          </p>
        ) : null}
      </SettingsField>

      <SettingsField className="scroll-mt-6" id="tracking-stop-on-match" tabIndex={-1} width="full">
        <Controller
          control={form.control}
          name="serpStopOnMatch"
          render={({ field }) => (
            <Switch
              aria-label={t("stopOnMatch")}
              checked={field.value}
              className="w-full"
              description={t("stopOnMatchDescription", { domain: domain ?? t("projectDomain") })}
              disabled={!canEdit}
              label={t("stopOnMatch")}
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
