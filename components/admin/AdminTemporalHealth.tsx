"use client";

import { displayTime, Metric, Panel } from "@/components/admin/AdminPrimitives";
import { AdminTemporalSchedules } from "@/components/admin/AdminTemporalSchedules";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { useFormatter, useTranslations } from "next-intl";

export function AdminTemporalHealth({
  temporal,
}: Readonly<{ temporal: InstanceAdminDashboard["temporal"] }>) {
  const context = useDateDisplay();
  const format = useFormatter();
  const t = useTranslations("instanceAdmin.dashboard.temporal");
  const values = useTranslations("instanceAdmin.values");
  const heartbeat = temporal.status === "ok" ? temporal.heartbeat : null;
  const unavailable = values("unavailable");
  const counterLines = new Set(
    heartbeat?.scheduleIssues.map(
      (issue) =>
        `${issue.scheduleId}: catchup ${issue.missedCatchup}, overlap ${issue.skippedOverlap}`,
    ) ?? [],
  );
  const diagnostics = [
    ...(heartbeat?.issueSchedules.filter((issue) => !counterLines.has(issue)) ?? []),
    ...temporal.bootstrapErrors,
  ];

  return (
    <Panel description={t("description")} id="admin-temporal" title={t("title")}>
      <p className="mb-3 text-[13px] leading-relaxed text-fg-muted">
        {temporal.collectedAt
          ? t("asOf", {
              time: format.dateTime(new Date(temporal.collectedAt), {
                hour: "2-digit",
                hour12: false,
                minute: "2-digit",
              }),
            })
          : unavailable}
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label={t("schedules")} value={heartbeat?.schedules ?? unavailable} />
        <Metric label={t("recentActions")} value={heartbeat?.recentActions ?? unavailable} />
        <Metric label={t("missedCatchup")} value={heartbeat?.missedCatchupTotal ?? unavailable} />
        <Metric label={t("skippedOverlap")} value={heartbeat?.skippedOverlapTotal ?? unavailable} />
        <Metric label={t("inspectionErrors")} value={heartbeat?.inspectionErrors ?? unavailable} />
        <Metric
          technical
          label={t("nextAction")}
          value={
            heartbeat ? displayTime(heartbeat.nextActionAt, context, unavailable) : unavailable
          }
        />
      </div>
      {temporal.status === "unavailable" ? (
        <p className="mt-3 rounded-card bg-yellow/10 p-3 text-[13px] leading-relaxed text-yellow-text">
          {t("snapshotUnavailable")}
        </p>
      ) : null}
      {temporal.status === "stale" ? (
        <p className="mt-3 rounded-card bg-yellow/10 p-3 text-[13px] text-yellow-text">
          {t("snapshotStale")}
        </p>
      ) : null}
      {temporal.status === "disabled" ? (
        <p className="mt-3 text-[13px] text-fg-muted">{t("disabled")}</p>
      ) : null}
      {heartbeat ? (
        <AdminTemporalSchedules
          issues={heartbeat.scheduleIssues}
          inspectionErrors={heartbeat.inspectionErrors}
        />
      ) : null}
      {diagnostics.length > 0 ? (
        <div className="mt-4 rounded-card border border-border p-3">
          <h3 className="text-sm font-semibold text-fg">{t("diagnostics")}</h3>
          <div className="mt-2 space-y-2 text-[13px] leading-5 text-fg-muted [overflow-wrap:anywhere]">
            {diagnostics.map((issue, index) => (
              <p key={`${index}:${issue}`}>{issue}</p>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
