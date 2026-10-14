"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { SubjectChoice } from "@/lib/local-monitors/contracts";
import type { MonitorFormValues } from "@/lib/local-monitors/form-model";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { UseFormReturn } from "react-hook-form";

export function MonitorCenterPicker({
  form,
  subjects,
  disabled,
}: Readonly<{
  form: UseFormReturn<MonitorFormValues>;
  subjects: readonly SubjectChoice[];
  disabled: boolean;
}>) {
  const t = useTranslations("shared.localMonitors");
  const id = useId();
  const latitude = form.watch("grid.latitude");
  const longitude = form.watch("grid.longitude");
  const matches = (subject: SubjectChoice) =>
    Boolean(
      latitude &&
        longitude &&
        subject.coordinates &&
        subject.coordinates.latitude.toFixed(7) === latitude &&
        subject.coordinates.longitude.toFixed(7) === longitude,
    );
  const [pickedId, setPickedId] = useState(() => {
    const initial = subjects.filter(matches);
    return initial.length === 1 ? initial[0].id : "";
  });
  const [manualOpen, setManualOpen] = useState(!latitude || !longitude);
  const coordinateError = Boolean(
    form.formState.errors.grid?.latitude || form.formState.errors.grid?.longitude,
  );
  const selected = subjects.find((subject) => subject.id === pickedId && matches(subject));
  const hasCoordinates = subjects.some((subject) => subject.coordinates);
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-heading`}>
      <div className="flex items-center gap-1">
        <h3 id={`${id}-heading`} className="m-0 text-ui-body font-medium">
          {t("center.title")}
        </h3>
        <InfoTooltip text={t("center.help")} />
      </div>
      <MenuSelect
        ariaLabel={t("center.choose")}
        ariaDescribedBy={hasCoordinates ? undefined : `${id}-empty`}
        size="input"
        searchable
        searchPlaceholder={t("center.search")}
        disabled={disabled || !subjects.length}
        value={selected?.id ?? ""}
        options={subjects.map((subject) => ({
          value: subject.id,
          label: subject.name,
          secondary: subject.coordinates
            ? (subject.address ?? undefined)
            : t("center.missingCoordinates"),
          searchText: `${subject.name} ${subject.address ?? ""}`,
          disabled: !subject.coordinates,
        }))}
        onChange={(value) => {
          const coordinate = subjects.find((subject) => subject.id === value)?.coordinates;
          if (!coordinate || disabled) return;
          setPickedId(value);
          setManualOpen(false);
          form.setValue("grid.latitude", coordinate.latitude.toFixed(7), {
            shouldDirty: true,
            shouldValidate: true,
          });
          form.setValue("grid.longitude", coordinate.longitude.toFixed(7), {
            shouldDirty: true,
            shouldValidate: true,
          });
        }}
      />
      {!hasCoordinates ? (
        <p id={`${id}-empty`} className="m-0 text-ui-xs text-fg-muted">
          {t("center.empty")}
        </p>
      ) : null}
      <details
        className="group"
        open={manualOpen || coordinateError}
        onToggle={(event) => {
          if (coordinateError && !event.currentTarget.open) event.currentTarget.open = true;
          else setManualOpen(event.currentTarget.open);
        }}
      >
        <summary className="w-fit cursor-pointer text-ui-xs text-fg-muted underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid">
          {t("center.manual")}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["latitude", "longitude"] as const).map((axis) => (
            <div className="grid gap-1.5" key={axis}>
              <FieldLabel
                htmlFor={`${id}-${axis}`}
                label={t(`fields.${axis}`)}
                className="text-ui-xs text-fg-muted"
              />
              <Input
                id={`${id}-${axis}`}
                inputMode="decimal"
                disabled={disabled}
                {...form.register(`grid.${axis}`)}
                aria-invalid={Boolean(form.getFieldState(`grid.${axis}`, form.formState).error)}
              />
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
