"use client";

import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { MONITOR_PILOT_GRID_SIZES } from "@/lib/local-monitor-store/pilot-grid";
import {
  localOperatingSystems,
  MAPS_REQUEST_SCOPE,
} from "@/lib/local-monitoring/maps-request-scope";
import type { MonitorFormValues } from "@/lib/local-monitors/form-model";
import { useTranslations } from "next-intl";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { MonitorRequestFields } from "./MonitorRequestFields";

export function MonitorFields({
  form,
  disabled,
}: {
  form: UseFormReturn<MonitorFormValues>;
  disabled: boolean;
}) {
  const t = useTranslations("shared.localMonitors");
  const id = useId();
  const surface = form.watch("axes.surface");
  const device = form.watch("axes.device");
  const size = form.watch("grid.size");
  const operatingSystem = form.watch("axes.operatingSystem");
  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">{t("definition")}</legend>
      {(
        [
          ["name", "name"],
          ["grid.latitude", "latitude"],
          ["grid.longitude", "longitude"],
          ["axes.language", "language"],
        ] as const
      ).map(([field, label]) => (
        <div key={field}>
          <label htmlFor={`${id}-${label}`} className="mb-1 block text-sm font-medium">
            {t(`fields.${label}`)}
          </label>
          <Input
            id={`${id}-${label}`}
            {...form.register(field)}
            aria-invalid={Boolean(form.getFieldState(field, form.formState).error)}
          />
        </div>
      ))}
      <div>
        <label htmlFor={`${id}-spacing`} className="mb-1 block text-sm font-medium">
          {t("fields.spacing")}
        </label>
        <Input
          id={`${id}-spacing`}
          type="number"
          min={1}
          max={100000}
          {...form.register("grid.spacingMetres", { valueAsNumber: true })}
        />
      </div>
      <div>
        <label htmlFor={`${id}-cutoff`} className="mb-1 block text-sm font-medium">
          {t("fields.cutoff")}
        </label>
        <Input
          id={`${id}-cutoff`}
          type="number"
          min={1}
          max={surface === "maps" ? MAPS_REQUEST_SCOPE.maxCutoff : 100}
          {...form.register("axes.cutoff", { valueAsNumber: true })}
        />
      </div>
      <MenuSelect
        ariaLabel={t("fields.surface")}
        disabled={disabled}
        value={surface}
        options={[
          { value: "maps", label: t("surfaces.maps") },
          { value: "local_finder", label: t("surfaces.local_finder") },
        ]}
        onChange={(value) => {
          if (value === "maps" || value === "local_finder") {
            form.setValue("axes.surface", value, { shouldDirty: true });
            form.setValue("axes.resultKind", value === "maps" ? "map_listing" : "listing");
            form.setValue("axes.rankScale", value === "maps" ? "maps_organic" : "finder_organic");
          }
        }}
      />
      <MenuSelect
        ariaLabel={t("fields.device")}
        disabled={disabled}
        value={device}
        options={[
          { value: "desktop", label: t("devices.desktop") },
          { value: "mobile", label: t("devices.mobile") },
        ]}
        onChange={(value) => {
          if (value === "desktop" || value === "mobile") {
            form.setValue("axes.device", value, { shouldDirty: true });
            const systems: readonly string[] = localOperatingSystems(value);
            if (operatingSystem !== null && !systems.includes(operatingSystem))
              form.setValue("axes.operatingSystem", null, {
                shouldDirty: true,
                shouldValidate: true,
              });
            form.setValue("keywordIds", [], { shouldDirty: true });
          }
        }}
      />
      <MenuSelect
        ariaLabel={t("fields.grid")}
        disabled={disabled}
        value={String(size)}
        options={[...MONITOR_PILOT_GRID_SIZES, ...(size === 7 ? [7] : [])].map((value) => ({
          value: String(value),
          label: value === 7 ? t("fields.retainedGrid") : `${value} × ${value}`,
          disabled: value === 7,
        }))}
        onChange={(value) => {
          const next = Number(value);
          if (next === 1 || next === 3 || next === 5)
            form.setValue("grid.size", next, { shouldDirty: true });
        }}
      />
      <MonitorRequestFields form={form} disabled={disabled} />
      <p className="text-sm text-fg-muted sm:col-span-2">{t("fields.gridPilotHelp")}</p>
    </fieldset>
  );
}
