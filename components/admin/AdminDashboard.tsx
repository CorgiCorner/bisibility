"use client";

import { AdminFailureBreakdown } from "@/components/admin/AdminFailureBreakdown";
import { AdminHealthPills } from "@/components/admin/AdminHealthPills";
import { AdminOpsActions } from "@/components/admin/AdminOpsActions";
import { displayTime, Metric, Panel, RankWindow } from "@/components/admin/AdminPrimitives";
import { AdminProviderHealth } from "@/components/admin/AdminProviderHealth";
import { AdminProviderUsageTable } from "@/components/admin/AdminProviderUsageTable";
import { AdminSectionUnavailable } from "@/components/admin/AdminSectionUnavailable";
import { AdminWorkerHealth } from "@/components/admin/AdminWorkerHealth";
import { AdminDashboardOpsEventsTable } from "@/components/admin/admin-dashboard-tables";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { checkFailureRate } from "@/lib/ops/instance-admin-health";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { DOCS_URL } from "@/lib/site/site";
import { useFormatter, useTranslations } from "next-intl";

type AdminTranslations = ReturnType<typeof useTranslations<"instanceAdmin">>;

function connectionKindLabel(kind: string, t: AdminTranslations) {
  if (kind === "analytics") return t("dashboard.stats.analytics");
  if (kind === "serp") return t("dashboard.stats.serp");
  return kind;
}

export function AdminDashboard({ data }: Readonly<{ data: InstanceAdminDashboard }>) {
  const context = useDateDisplay();
  const format = useFormatter();
  const t = useTranslations("instanceAdmin");
  const temporalHeartbeat = data.temporal.status === "ok" ? data.temporal.heartbeat : null;
  const temporalSnapshotNote =
    data.temporal.status === "stale" ? t("dashboard.temporal.snapshotStale") : null;
  const temporalIssues = [
    ...(temporalSnapshotNote ? [temporalSnapshotNote] : []),
    ...(temporalHeartbeat?.issueSchedules ?? []),
    ...data.temporal.bootstrapErrors,
  ];
  const checkFailureRatePercent = data.availability.rankChecks
    ? checkFailureRate(data.rank24h.failed, data.rank24h.succeeded)
    : null;
  const unavailable = t("values.unavailable");

  return (
    <div className="flex w-full flex-col gap-4">
      <AdminHealthPills
        checkFailureRatePercent={checkFailureRatePercent}
        providerHealth={data.availability.dataSources ? data.providerHealth : []}
        undeliveredCount={data.availability.opsDelivery ? data.ops.undeliveredCount : null}
        workerStatus={data.worker.status}
      />

      <AdminWorkerHealth available={data.availability.worker} ops={data.ops} worker={data.worker} />

      <Panel
        description={t("dashboard.rankChecks.description")}
        id="admin-rank-checks"
        title={t("dashboard.rankChecks.title")}
      >
        {!data.availability.rankChecks ? (
          <AdminSectionUnavailable>{t("dashboard.rankChecks.unavailable")}</AdminSectionUnavailable>
        ) : (
          <div className="space-y-5">
            <RankWindow data={data.rank24h} label={t("dashboard.rankChecks.last24Hours")} />
            <RankWindow data={data.rank7d} label={t("dashboard.rankChecks.last7Days")} />
            <div>
              <h3 className="text-sm font-semibold text-fg">
                {t("dashboard.rankChecks.failures")}
              </h3>
              <p className="mt-1 text-xs text-fg-muted">
                {t("dashboard.rankChecks.failureDescription")}
              </p>
              <div className="mt-2">
                <AdminFailureBreakdown
                  breakdown={data.rank24h.failureBreakdown}
                  now={data.generatedAt}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">
                {t("dashboard.rankChecks.fallbacks")}
              </h3>
              <p className="mt-1 text-xs text-fg-muted">
                {t("dashboard.rankChecks.fallbackDescription")}
              </p>
              <div className="mt-2">
                <AdminFailureBreakdown
                  breakdown={data.rank24h.fallbackBreakdown}
                  emptyLabel={t("dashboard.rankChecks.fallbackEmpty")}
                  now={data.generatedAt}
                />
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        description={t("dashboard.dataSources.description")}
        id="admin-data-sources"
        title={t("dashboard.dataSources.title")}
      >
        {!data.availability.dataSources ? (
          <AdminSectionUnavailable>
            {t("dashboard.dataSources.unavailable")}
          </AdminSectionUnavailable>
        ) : (
          <AdminProviderHealth rows={data.providerHealth} />
        )}
      </Panel>

      <Panel
        description={t("dashboard.presence.description")}
        id="admin-url-presence"
        title={t("dashboard.presence.title")}
      >
        {!data.availability.presence ? (
          <AdminSectionUnavailable>{t("dashboard.presence.unavailable")}</AdminSectionUnavailable>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label={t("dashboard.presence.deferredUrls")}
              value={data.presence?.deferred ?? unavailable}
            />
            <Metric
              label={t("dashboard.presence.affectedProjects")}
              value={data.presence?.affectedProjects ?? unavailable}
            />
            <Metric
              label={t("dashboard.presence.lastBudgetExhaustion")}
              value={
                <span className="text-sm">
                  {displayTime(data.presence?.occurredAt ?? null, context, unavailable)}
                </span>
              }
            />
          </div>
        )}
      </Panel>

      <Panel
        description={t("dashboard.temporal.description")}
        id="admin-temporal"
        title={t("dashboard.temporal.title")}
      >
        <p className="mb-3 text-xs text-fg-muted">
          {data.temporal.collectedAt
            ? t("dashboard.temporal.asOf", {
                time: format.dateTime(new Date(data.temporal.collectedAt), {
                  hour: "2-digit",
                  hour12: false,
                  minute: "2-digit",
                }),
              })
            : unavailable}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric
            label={t("dashboard.temporal.schedules")}
            value={temporalHeartbeat?.schedules ?? unavailable}
          />
          <Metric
            label={t("dashboard.temporal.recentActions")}
            value={temporalHeartbeat?.recentActions ?? unavailable}
          />
          <Metric
            label={t("dashboard.temporal.missedCatchup")}
            value={temporalHeartbeat?.missedCatchupTotal ?? unavailable}
          />
          <Metric
            label={t("dashboard.temporal.skippedOverlap")}
            value={temporalHeartbeat?.skippedOverlapTotal ?? unavailable}
          />
          <Metric
            label={t("dashboard.temporal.inspectionErrors")}
            value={temporalHeartbeat?.inspectionErrors ?? unavailable}
          />
          <Metric
            label={t("dashboard.temporal.nextAction")}
            value={
              <span className="text-sm">
                {temporalHeartbeat
                  ? displayTime(temporalHeartbeat.nextActionAt, context, unavailable)
                  : unavailable}
              </span>
            }
          />
        </div>
        {data.temporal.status === "unavailable" ? (
          <p className="mt-3 rounded-card bg-yellow/10 p-3 text-xs text-yellow-text">
            {t("dashboard.temporal.snapshotUnavailable")}
          </p>
        ) : null}
        {data.temporal.status === "disabled" ? (
          <p className="mt-3 rounded-card bg-bg-sunken p-3 text-xs text-fg-muted">
            {t("dashboard.temporal.disabled")}
          </p>
        ) : null}
        {temporalIssues.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-card bg-bg-sunken p-3 text-[11px] text-fg-muted">
            {temporalIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel
        description={t("dashboard.ops.description")}
        id="admin-ops-events"
        title={t("dashboard.ops.title")}
      >
        {!data.ops.configured ? (
          <div className="mb-3 rounded-card bg-yellow/10 p-3">
            <p className="m-0 text-xs leading-relaxed text-yellow-text">
              {t("dashboard.ops.slackMissing")}
            </p>
            <ExternalLink
              className="mt-2 text-xs font-semibold text-accent-text hover:underline"
              href={`${DOCS_URL}/self-hosting/operations`}
            >
              {t("dashboard.ops.slackMissingLink")}
            </ExternalLink>
          </div>
        ) : null}
        <div className="mb-3">
          <AdminOpsActions slackConfigured={data.ops.configured && data.ops.enabled} />
        </div>
        {!data.availability.opsDelivery ? (
          <div className="mb-3">
            <AdminSectionUnavailable>
              {t("dashboard.ops.deliveryUnavailable")}
            </AdminSectionUnavailable>
          </div>
        ) : null}
        {!data.availability.opsEvents ? (
          <AdminSectionUnavailable>{t("dashboard.ops.historyUnavailable")}</AdminSectionUnavailable>
        ) : data.ops.events.length === 0 ? (
          <p className="text-xs text-fg-muted">{t("dashboard.ops.empty")}</p>
        ) : (
          <AdminDashboardOpsEventsTable events={data.ops.events} />
        )}
      </Panel>

      <Panel
        description={t("dashboard.stats.description")}
        id="admin-instance-stats"
        title={t("dashboard.stats.title")}
      >
        {!data.availability.stats ? (
          <AdminSectionUnavailable>{t("dashboard.stats.unavailable")}</AdminSectionUnavailable>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              <Metric label={t("dashboard.stats.users")} value={data.stats.users} />
              <Metric label={t("dashboard.stats.projects")} value={data.stats.projects} />
              <Metric label={t("dashboard.stats.keywords")} value={data.stats.keywords} />
              {data.stats.activeProviderConnectionsByKind.map((connection) => (
                <Metric
                  key={connection.kind}
                  label={t("dashboard.stats.connections", {
                    kind: connectionKindLabel(connection.kind, t),
                  })}
                  value={connection.count}
                />
              ))}
            </div>
            <AdminProviderUsageTable usage={data.stats.providerUsage} />
          </>
        )}
      </Panel>
    </div>
  );
}
