"use client";

import { Badge, displayTime, Metric, Panel } from "@/components/admin/AdminPrimitives";
import { AdminSectionUnavailable } from "@/components/admin/AdminSectionUnavailable";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { IdChip } from "@/components/ui/IdChip";
import type { MigrationComparison } from "@/lib/db/migration-state";
import type { InstanceAdminDashboard } from "@/lib/instance-admin/dashboard-types";
import { DOCS_URL } from "@/lib/site/site";
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
  const workerDocsLabel = useTranslations("instanceAdmin.shellHealth")("workerUnknownDocs");
  const values = useTranslations("instanceAdmin.values");
  const status = schemaStatus(worker.schemaComparison, t, statusT("unknown"));

  return (
    <Panel description={t("description")} id="admin-worker" title={t("title")}>
      {!available ? (
        <div className="grid gap-3">
          <AdminSectionUnavailable>{t("unavailable")}</AdminSectionUnavailable>
          <ExternalLink
            href={`${DOCS_URL}/self-hosting/temporal#scheduled-rank-checks`}
            className="text-sm underline"
          >
            {workerDocsLabel}
          </ExternalLink>
        </div>
      ) : worker.schedulerDriver === "none" ? (
        <AdminSectionUnavailable>{t("disabled")}</AdminSectionUnavailable>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={t("status")} value={<Badge status={worker.status} />} />
          <Metric
            label={t("lastHeartbeat")}
            value={
              <span className="text-[13px] leading-5">
                {displayTime(worker.lastSeenAt, context, values("unavailable"))}
              </span>
            }
          />
          <Metric
            technical
            label={t("release")}
            value={
              worker.release ? <IdChip value={worker.release} size="lg" /> : values("unavailable")
            }
          />
          <Metric technical label={t("environment")} value={<span>{worker.environment}</span>} />
          <Metric
            technical
            label={t("schedulerDriver")}
            value={<span>{worker.schedulerDriver}</span>}
          />
          <Metric
            label={t("schemaStatus")}
            value={<Badge status={status.tone}>{status.label}</Badge>}
          />
          <Metric
            technical
            label={t("bundledMigration")}
            value={
              worker.bundledMigration ? (
                <IdChip value={worker.bundledMigration} size="lg" />
              ) : (
                values("unavailable")
              )
            }
          />
          <Metric
            technical
            label={t("appliedMigration")}
            value={
              worker.appliedMigration ? (
                <IdChip value={worker.appliedMigration} size="lg" />
              ) : (
                values("unavailable")
              )
            }
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
