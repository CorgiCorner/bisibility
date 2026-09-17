"use client";

import { Badge, displayTime, Metric, Panel } from "@/components/admin/AdminPrimitives";
import { AdminSectionUnavailable } from "@/components/admin/AdminSectionUnavailable";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import type { MigrationComparison } from "@/lib/db/migration-state";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { useTranslations } from "next-intl";

type WorkerTranslations = ReturnType<typeof useTranslations<"instanceAdmin.worker">>;

function schemaStatus(comparison: MigrationComparison, t: WorkerTranslations, unknown: string) {
  if (comparison === "ok") return { label: t("schemaInSync"), tone: "ok" };
  if (comparison === "worker-behind") return { label: t("schemaWorkerBehind"), tone: "error" };
  if (comparison === "worker-ahead") return { label: t("schemaWorkerAhead"), tone: "warning" };
  return { label: unknown, tone: "unknown" };
}

export function AdminWorkerHealth({
  available,
  ops,
  worker,
}: Readonly<{
  available: boolean;
  ops: InstanceAdminDashboard["ops"];
  worker: InstanceAdminDashboard["worker"];
}>) {
  const context = useDateDisplay();
  const t = useTranslations("instanceAdmin.worker");
  const statusT = useTranslations("instanceAdmin.status");
  const values = useTranslations("instanceAdmin.values");
  const status = schemaStatus(worker.schemaComparison, t, statusT("unknown"));

  return (
    <Panel description={t("description")} id="admin-worker" title={t("title")}>
      {!available ? (
        <AdminSectionUnavailable>{t("unavailable")}</AdminSectionUnavailable>
      ) : worker.schedulerDriver === "none" ? (
        <AdminSectionUnavailable>{t("disabled")}</AdminSectionUnavailable>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={t("status")} value={<Badge status={worker.status} />} />
          <Metric
            label={t("lastHeartbeat")}
            value={
              <span className="text-sm">
                {displayTime(worker.lastSeenAt, context, values("unavailable"))}
              </span>
            }
          />
          <Metric label={t("release")} value={<span>{worker.release}</span>} />
          <Metric label={t("environment")} value={<span>{worker.environment}</span>} />
          <Metric label={t("schedulerDriver")} value={<span>{worker.schedulerDriver}</span>} />
          <Metric
            label={t("schemaStatus")}
            value={<Badge status={status.tone}>{status.label}</Badge>}
          />
          <Metric
            label={t("bundledMigration")}
            value={<span>{worker.bundledMigration ?? values("unavailable")}</span>}
          />
          <Metric
            label={t("appliedMigration")}
            value={<span>{worker.appliedMigration ?? values("unavailable")}</span>}
          />
          <Metric
            label={t("slackOps")}
            value={
              <Badge status={ops.enabled ? "ok" : "unknown"}>
                {ops.configured
                  ? ops.enabled
                    ? statusT("configured")
                    : statusT("disabled")
                  : statusT("notConfigured")}
              </Badge>
            }
          />
        </div>
      )}
    </Panel>
  );
}
