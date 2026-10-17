"use client";

import { AdminEmailAllowance } from "@/components/admin/AdminEmailAllowance";
import { AdminFailureBreakdown } from "@/components/admin/AdminFailureBreakdown";
import { AdminHealthPills } from "@/components/admin/AdminHealthPills";
import { AdminOpsActions } from "@/components/admin/AdminOpsActions";
import { displayTime, Metric, Panel, RankWindow } from "@/components/admin/AdminPrimitives";
import { AdminProviderHealth } from "@/components/admin/AdminProviderHealth";
import { AdminProviderUsageTable } from "@/components/admin/AdminProviderUsageTable";
import { AdminSectionUnavailable } from "@/components/admin/AdminSectionUnavailable";
import { AdminTemporalHealth } from "@/components/admin/AdminTemporalHealth";
import { AdminWorkerHealth } from "@/components/admin/AdminWorkerHealth";
import { AdminDashboardOpsEventsTable } from "@/components/admin/admin-dashboard-tables";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { ExternalLink } from "@/components/ui/ExternalLink";
import type { InstanceEmailAllowance } from "@/lib/email/allowance-model";
import { checkFailureRate } from "@/lib/ops/instance-admin-health";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { DOCS_URL } from "@/lib/site/site";
import { useTranslations } from "next-intl";

type AdminTranslations = ReturnType<typeof useTranslations<"instanceAdmin">>;

function connectionKindLabel(kind: string, t: AdminTranslations) {
  if (kind === "analytics") return t("dashboard.stats.analytics");
  if (kind === "serp") return t("dashboard.stats.serp");
  return kind;
}

export function AdminDashboard({
  data,
  emailAllowance,
}: Readonly<{ data: InstanceAdminDashboard; emailAllowance?: InstanceEmailAllowance }>) {
  const context = useDateDisplay();
  const t = useTranslations("instanceAdmin");
  const checkFailureRatePercent = data.availability.rankChecks
    ? checkFailureRate(data.rank24h.failed, data.rank24h.succeeded)
    : null;
  const unavailable = t("values.unavailable");

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <AdminHealthPills
        checkFailureRatePercent={checkFailureRatePercent}
        providerHealth={data.availability.dataSources ? data.providerHealth : []}
        undeliveredCount={data.availability.opsDelivery ? data.ops.undeliveredCount : null}
        workerStatus={data.worker.status}
      />

      <AdminWorkerHealth available={data.availability.worker} ops={data.ops} worker={data.worker} />

      {emailAllowance ? <AdminEmailAllowance allowance={emailAllowance} /> : null}

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
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
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
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
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
                <span className="text-[13px] leading-5">
                  {displayTime(data.presence?.occurredAt ?? null, context, unavailable)}
                </span>
              }
            />
          </div>
        )}
      </Panel>

      <AdminTemporalHealth temporal={data.temporal} />

      <Panel
        description={t("dashboard.ops.description")}
        id="admin-ops-events"
        title={t("dashboard.ops.title")}
      >
        {!data.ops.configured ? (
          <div className="mb-3 rounded-card bg-yellow/10 p-3">
            <p className="m-0 text-[13px] leading-relaxed text-yellow-text">
              {t("dashboard.ops.slackMissing")}
            </p>
            <ExternalLink
              className="mt-2 text-[13px] font-semibold text-accent-text hover:underline"
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
          <p className="text-[13px] leading-relaxed text-fg-muted">{t("dashboard.ops.empty")}</p>
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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
