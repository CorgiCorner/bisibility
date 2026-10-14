"use client";

import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  localOperatingSystems,
  MAPS_REQUEST_SCOPE,
} from "@/lib/local-monitoring/maps-request-scope";
import type { MonitorFormValues } from "@/lib/local-monitors/form-model";
import { useTranslations } from "next-intl";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { MonitorField } from "./MonitorField";

export function MonitorRequestFields({
  form,
  disabled,
}: {
  form: UseFormReturn<MonitorFormValues>;
  disabled: boolean;
}) {
  const t = useTranslations("shared.localMonitors");
  const id = useId();
  const device = form.watch("axes.device");
  const surface = form.watch("axes.surface");
  const operatingSystem = form.watch("axes.operatingSystem");
  const systems: readonly string[] = localOperatingSystems(device);
  const zoomRange = surface === "maps" ? MAPS_REQUEST_SCOPE.zoomRange : [4, 18];
  return (
    <>
      <MonitorField label={t("fields.operatingSystem")} help={t("axesHelp")}>
        <MenuSelect
          size="input"
          ariaLabel={t("fields.operatingSystem")}
          ariaInvalid={Boolean(form.formState.errors.axes?.operatingSystem)}
          disabled={disabled}
          value={operatingSystem ?? ""}
          options={[
            ...systems.map((value) => ({ value, label: value })),
            ...(operatingSystem && !systems.includes(operatingSystem)
              ? [{ value: operatingSystem, label: operatingSystem, disabled: true }]
              : []),
          ]}
          onChange={(value) => {
            if (systems.includes(value))
              form.setValue("axes.operatingSystem", value, {
                shouldDirty: true,
                shouldValidate: true,
              });
          }}
        />
      </MonitorField>
      <div>
        <label
          htmlFor={`${id}-zoom`}
          className="mb-1.5 flex min-h-6 items-center text-ui-xs text-fg-muted"
        >
          {t("fields.zoom")}
        </label>
        <Input
          id={`${id}-zoom`}
          type="number"
          step={1}
          min={zoomRange[0]}
          max={zoomRange[1]}
          aria-invalid={Boolean(form.formState.errors.axes?.zoom)}
          {...form.register("axes.zoom", { valueAsNumber: true })}
        />
      </div>
    </>
  );
}
