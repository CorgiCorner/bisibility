import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { type ScheduleEditorValues, scheduleEditorValidationCode } from "./ScheduleEditorModel";

export function ScheduleEditorErrorText({ text }: Readonly<{ text?: string }>) {
  const t = useTranslations("projectRuns.schedules");
  const message =
    text === scheduleEditorValidationCode.invalidCron
      ? t("editor.invalidCron")
      : text === scheduleEditorValidationCode.cronTooLong
        ? t("editor.cronTooLong", { maximum: 120 })
        : text === scheduleEditorValidationCode.invalidTime
          ? t("editor.invalidTime")
          : text === scheduleEditorValidationCode.invalidTimeStep
            ? t("editor.invalidTimeStep")
            : text === scheduleEditorValidationCode.name
              ? t("editor.scheduleName")
              : text === scheduleEditorValidationCode.nameTooLong
                ? t("editor.scheduleNameTooLong", { maximum: 80 })
                : null;
  return message ? <span className="text-[11px] leading-5 text-red-text">{message}</span> : null;
}

type ScheduleEditorSelectFieldProps = {
  ariaLabel: string;
  form: UseFormReturn<ScheduleEditorValues>;
  help?: string;
  label: string;
  labelClass: string;
  name: "jitterMinutes" | "providerPolicy" | "serpDepth";
  options: { label: string; value: string }[];
  triggerClassName: string;
};

export function ScheduleEditorSelectField({
  ariaLabel,
  form,
  help,
  label,
  labelClass,
  name,
  options,
  triggerClassName,
}: Readonly<ScheduleEditorSelectFieldProps>) {
  const { register, setValue, watch } = form;
  return (
    <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
      <FieldLabel className={labelClass} label={label} />
      <input type="hidden" {...register(name)} />
      <MenuSelect
        ariaLabel={ariaLabel}
        onChange={(value) =>
          setValue(name, value as ScheduleEditorValues[typeof name], {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        options={options}
        triggerClassName={triggerClassName}
        value={watch(name)}
      />
      {help ? <span className="text-[11px] leading-5 text-fg-muted">{help}</span> : null}
    </div>
  );
}
