"use client";

import type { MonitorDetail } from "@/lib/local-monitors/contracts";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

export function MonitorCapturedScope({ monitor }: { monitor: MonitorDetail }) {
  const t = useTranslations("shared.localMonitors");
  const format = useFormatter();
  const id = useId();
  const axes = monitor.axes,
    calendar = monitor.schedule.calendar;
  const definitionRows = [
    ["subjectReference", monitor.locationId],
    ["identityRevision", monitor.identityRevisionId],
    ["engine", axes.engine],
    ["surface", t(`surfaces.${axes.surface}`)],
    ["resultKind", t(`resultKinds.${axes.resultKind}`)],
    ["rankScale", t(`rankScales.${axes.rankScale}`)],
    ["language", axes.language],
    ["device", t(`devices.${axes.device}`)],
    ["operatingSystem", axes.operatingSystem ?? t("unrestricted")],
    ["zoom", axes.zoom === null ? t("unrestricted") : String(axes.zoom)],
    ["latitude", monitor.grid.center.latitude],
    ["longitude", monitor.grid.center.longitude],
    ["grid", `${monitor.grid.size} × ${monitor.grid.size}`],
    ["spacing", t("metres", { count: format.number(monitor.grid.spacingMetres) })],
    ["cutoff", String(axes.cutoff)],
  ] as const;
  const calendarRows = calendar
    ? ([
        ["calendarReference", calendar.id],
        ["calendarEpoch", calendar.measurementEpoch],
        [
          "frequency",
          calendar.frequency === "daily" ||
          calendar.frequency === "weekly" ||
          calendar.frequency === "monthly" ||
          calendar.frequency === "custom_cron"
            ? t(`frequencies.${calendar.frequency}`)
            : calendar.frequency,
        ],
        ["cron", calendar.cronExpression ?? t("notSet")],
        ["timeOfDay", calendar.timeOfDay ?? t("notSet")],
        ["timezone", calendar.timezone],
        ["jitter", t("minutes", { count: format.number(calendar.jitterMinutes) })],
        [
          "configuredDepth",
          calendar.configuredSerpDepth === null
            ? t("notSet")
            : String(calendar.configuredSerpDepth),
        ],
        ["providerPolicy", calendar.configuredProviderPolicy ?? t("notSet")],
      ] as const)
    : [];
  return (
    <section className="space-y-3" aria-labelledby={id}>
      <h2 id={id} className="font-semibold">
        {t("capturedScope")}
      </h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {definitionRows.map(([key, value]) => (
          <div key={key}>
            <dt className="text-fg-muted">{t(`fields.${key}`)}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="font-medium">{t("capturedCalendar")}</h3>
      {calendar ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {calendarRows.map(([key, value]) => (
            <div key={key}>
              <dt className="text-fg-muted">{t(`fields.${key}`)}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-fg-muted">{t("noSavedCalendar")}</p>
      )}
    </section>
  );
}
