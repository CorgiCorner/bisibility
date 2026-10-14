"use client";
import { recurringCentsUsd, recurringQuoteCents } from "@/lib/local-monitor-recurring/cost";
import type { previewRecurringMonitorAction } from "@/lib/local-monitor-recurring/session-actions";
import { useFormatter, useTranslations } from "next-intl";

type Command = Extract<
  Awaited<ReturnType<typeof previewRecurringMonitorAction>>,
  { kind: "ready" }
>["command"];
/** Every authority value comes from the immutable reviewed command, never the editable draft. */
export function MonitorRecurringReview({ command }: { command: Command }) {
  const t = useTranslations("shared.localMonitors.recurring"),
    format = useFormatter();
  return (
    <section aria-label={t("review")} className="space-y-2 text-sm">
      <p>{t("reviewNotice")}</p>
      <p>
        {t("capturedCalendar", {
          timezone: command.calendar.timezone,
          frequency: t(`frequencies.${command.calendar.frequency}`),
        })}
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt>{t("quoted")}</dt>
          <dd>USD {recurringCentsUsd(recurringQuoteCents(command.quote))}</dd>
        </div>
        <div>
          <dt>{t("perOccurrence")}</dt>
          <dd>USD {recurringCentsUsd(command.maximumPerOccurrenceCents)}</dd>
        </div>
        <div>
          <dt>{t("total")}</dt>
          <dd>USD {recurringCentsUsd(command.maximumTotalCents)}</dd>
        </div>
        <div>
          <dt>{t("maximumOccurrences")}</dt>
          <dd>{format.number(command.maximumOccurrences)}</dd>
        </div>
        <div>
          <dt>{t("validThrough")}</dt>
          <dd>
            {format.dateTime(new Date(command.validUntil), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </dd>
        </div>
      </dl>
    </section>
  );
}
