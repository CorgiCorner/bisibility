"use client";

import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { MONITOR_PILOT_GRID_SIZES } from "@/lib/local-monitor-store/pilot-grid";
import {
  FINDER_REQUEST_SCOPE,
  localOperatingSystems,
  MAPS_REQUEST_SCOPE,
} from "@/lib/local-monitoring/maps-request-scope";
import { LOCAL_SEARCH_LANGUAGES } from "@/lib/local-monitoring/search-languages";
import type { MonitorFormValues } from "@/lib/local-monitors/form-model";
import { useTranslations } from "next-intl";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { MonitorField } from "./MonitorField";
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
    <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
      <legend className="sr-only">{t("definition")}</legend>
      <div className="grid gap-1.5 sm:col-span-2">
        <label
          htmlFor={`${id}-name`}
          className="flex min-h-6 items-center text-ui-xs text-fg-muted"
        >
          {t("fields.name")}
        </label>
        <Input
          id={`${id}-name`}
          {...form.register("name")}
          aria-invalid={Boolean(form.formState.errors.name)}
        />
      </div>
      <MonitorField label={t("fields.language")}>
        <MenuSelect
          size="input"
          ariaLabel={t("fields.language")}
          ariaInvalid={Boolean(form.formState.errors.axes?.language)}
          searchable
          disabled={disabled}
          value={form.watch("axes.language")}
          options={LOCAL_SEARCH_LANGUAGES}
          onChange={(value) =>
            form.setValue("axes.language", value, { shouldDirty: true, shouldValidate: true })
          }
        />
      </MonitorField>
      <div>
        <label
          htmlFor={`${id}-spacing`}
          className="mb-1.5 flex min-h-6 items-center text-ui-xs text-fg-muted"
        >
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
        <label
          htmlFor={`${id}-cutoff`}
          className="mb-1.5 flex min-h-6 items-center text-ui-xs text-fg-muted"
        >
          {t("fields.cutoff")}
        </label>
        <Input
          id={`${id}-cutoff`}
          type="number"
          min={1}
          max={surface === "maps" ? MAPS_REQUEST_SCOPE.maxCutoff : FINDER_REQUEST_SCOPE.maxCutoff}
          {...form.register("axes.cutoff", { valueAsNumber: true })}
        />
      </div>
      <MonitorField label={t("fields.surface")}>
        <MenuSelect
          size="input"
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
              form.setValue("axes.rankScale", value === "maps" ? "maps_organic" : "finder_group");
            }
          }}
        />
      </MonitorField>
      <MonitorField label={t("fields.device")}>
        <MenuSelect
          size="input"
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
      </MonitorField>
      <MonitorField label={t("fields.grid")} help={t("fields.gridPilotHelp")}>
        <MenuSelect
          size="input"
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
      </MonitorField>
      <MonitorRequestFields form={form} disabled={disabled} />
    </fieldset>
  );
}
