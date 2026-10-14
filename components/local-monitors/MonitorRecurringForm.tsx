"use client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  type RecurringFormValues,
  recurringFormSchema,
} from "@/lib/local-monitor-recurring/form-schema";
import type { readRecurringMonitorAction } from "@/lib/local-monitor-recurring/session-actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useForm } from "react-hook-form";

type State = Awaited<ReturnType<typeof readRecurringMonitorAction>>;
export function MonitorRecurringForm({
  state,
  pending,
  onReview,
}: {
  state: State;
  pending: boolean;
  onReview: (values: RecurringFormValues) => Promise<void>;
}) {
  const t = useTranslations("shared.localMonitors.recurring");
  const fieldId = useId();
  const form = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: {
      connectionId: "",
      scheduleId: "",
      maximumPerOccurrenceUsd: "",
      maximumTotalUsd: "",
      validUntil: "",
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;
  return (
    <form className="space-y-3" onSubmit={handleSubmit(onReview)}>
      <div className="block text-sm">
        <span>{t("calendar")}</span>
        <MenuSelect
          value={form.watch("scheduleId")}
          onChange={(value) => form.setValue("scheduleId", value, { shouldValidate: true })}
          options={[
            { value: "", label: t("chooseCalendar") },
            ...state.schedules.map((row) => ({
              value: row.id,
              label: `${row.name} · ${row.timezone ?? t("projectTimezone")}`,
            })),
          ]}
          ariaLabel={t("calendar")}
          disabled={pending}
          ariaInvalid={Boolean(errors.scheduleId)}
        />
      </div>
      <div className="block text-sm">
        <span>{t("connection")}</span>
        <MenuSelect
          value={form.watch("connectionId")}
          onChange={(value) => form.setValue("connectionId", value, { shouldValidate: true })}
          options={[
            { value: "", label: t("chooseConnection") },
            ...state.connections.map((row) => ({
              value: row.id,
              label: `${row.provider} · ${row.id}`,
            })),
          ]}
          ariaLabel={t("connection")}
          disabled={pending}
          ariaInvalid={Boolean(errors.connectionId)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${fieldId}-maximumPerOccurrenceUsd`} className="block text-sm">
          {t("perOccurrence")}
          <Input
            id={`${fieldId}-maximumPerOccurrenceUsd`}
            {...register("maximumPerOccurrenceUsd")}
            inputMode="decimal"
            disabled={pending}
            aria-invalid={Boolean(errors.maximumPerOccurrenceUsd)}
          />
        </label>
        <label htmlFor={`${fieldId}-maximumTotalUsd`} className="block text-sm">
          {t("total")}
          <Input
            id={`${fieldId}-maximumTotalUsd`}
            {...register("maximumTotalUsd")}
            inputMode="decimal"
            disabled={pending}
            aria-invalid={Boolean(errors.maximumTotalUsd)}
          />
        </label>
        <label htmlFor={`${fieldId}-maximumOccurrences`} className="block text-sm">
          {t("maximumOccurrences")}
          <Input
            id={`${fieldId}-maximumOccurrences`}
            {...register("maximumOccurrences", { valueAsNumber: true })}
            type="number"
            min={1}
            max={10000}
            disabled={pending}
            aria-invalid={Boolean(errors.maximumOccurrences)}
          />
        </label>
        <label htmlFor={`${fieldId}-validUntil`} className="block text-sm">
          {t("validUntil")}
          <Input
            id={`${fieldId}-validUntil`}
            {...register("validUntil")}
            type="datetime-local"
            disabled={pending}
            aria-invalid={Boolean(errors.validUntil)}
          />
        </label>
      </div>
      {Object.keys(errors).length ? (
        <p role="alert" className="text-sm text-red-text">
          {t("invalid")}
        </p>
      ) : null}
      <p className="text-sm text-fg-muted">{t("policy")}</p>
      <Button type="submit" disabled={pending || state.choicesTruncated}>
        {t("review")}
      </Button>
    </form>
  );
}
