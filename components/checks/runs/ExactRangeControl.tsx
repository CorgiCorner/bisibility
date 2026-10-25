"use client";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Input } from "@/components/ui/Input";
import { Popup } from "@/components/ui/Popup";
import { type ExactCheckRange, exactCheckRangeSchema } from "@/lib/checks/exact-range";
import {
  localizedDateTimeInputToUtc,
  localizedDateTimeInputValue,
  localizedInputCalendarDay,
  localizedInputSelectDay,
} from "@/lib/checks/localized-date-input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

function localRangeSchema(locale: string, timeZone: string, invalidRange: string) {
  return z.object({ from: z.string(), to: z.string() }).transform((value, context) => {
    try {
      return exactCheckRangeSchema.parse({
        from: localizedDateTimeInputToUtc(value.from, locale, timeZone),
        to: localizedDateTimeInputToUtc(value.to, locale, timeZone),
      });
    } catch {
      context.addIssue({ code: "custom", message: invalidRange });
      return z.NEVER;
    }
  });
}
export function ExactRangeControl({
  value,
  now,
  timeZone,
  onApply,
  error = false,
}: Readonly<{
  value: ExactCheckRange | null;
  now: Date;
  timeZone: string;
  onApply: (value: ExactCheckRange) => void;
  error?: boolean;
}>) {
  const t = useTranslations("projectRankTracker.checks.evidence");
  const locale = useLocale();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const inputId = useId();
  const schema = localRangeSchema(locale, timeZone, t("invalidRange"));
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      from: localizedDateTimeInputValue(
        value ? new Date(value.from) : new Date(now.getTime() - 86400000),
        locale,
        timeZone,
      ),
      to: localizedDateTimeInputValue(value ? new Date(value.to) : now, locale, timeZone),
    },
  });
  const [calendarField, setCalendarField] = useState<"from" | "to">("from");
  const selected = form.watch(calendarField);
  return (
    <div className="min-w-0">
      <Button
        size="sm"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {t("customRange")}
      </Button>
      {error ? (
        <p className="m-0 mt-1 text-ui-caption text-red-text" role="alert">
          {t("invalidRange")}
        </p>
      ) : null}
      <Popup
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        side="bottom"
        align="end"
        contentProps={{
          role: "dialog",
          "aria-label": t("customRange"),
          className: "rounded-card border border-border bg-bg-elev text-fg",
        }}
      >
        <form
          className="grid w-72 max-w-full gap-3 p-3.5"
          onSubmit={form.handleSubmit((range) => {
            onApply(range);
            setAnchor(null);
          })}
        >
          {(["from", "to"] as const).map((key) => (
            <label htmlFor={`${inputId}-${key}`} key={key} className="grid gap-1 text-ui-caption">
              {t(key)}
              <Input
                density="compact"
                id={`${inputId}-${key}`}
                {...form.register(key)}
                aria-label={t(key)}
                placeholder={t("dateTime")}
                onFocus={() => setCalendarField(key)}
              />
            </label>
          ))}
          <Calendar
            ariaLabel={t("dateTime")}
            value={localizedInputCalendarDay(selected, locale, timeZone)}
            onChange={(date) => {
              try {
                form.setValue(
                  calendarField,
                  localizedInputSelectDay(selected, date, locale, timeZone),
                  { shouldValidate: true },
                );
              } catch {
                form.setError(calendarField, { message: t("invalidRange") });
              }
            }}
          />
          <p className="m-0 text-ui-caption text-fg-muted">{t("timeZone", { timeZone })}</p>
          {Object.keys(form.formState.errors).length ? (
            <p className="m-0 text-ui-caption text-red-text" role="alert">
              {t("invalidRange")}
            </p>
          ) : null}
          <Button size="sm" type="submit">
            {t("apply")}
          </Button>
        </form>
      </Popup>
    </div>
  );
}
