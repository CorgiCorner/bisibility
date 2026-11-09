"use client";
import { AdminFailureBreakdown } from "@/components/admin/AdminFailureBreakdown";
import { displayTime, Metric, Panel, RankWindow } from "@/components/admin/AdminPrimitives";
import { AdminProviderHealth } from "@/components/admin/AdminProviderHealth";
import { AdminSectionUnavailable } from "@/components/admin/AdminSectionUnavailable";
import { AdminTemporalHealth } from "@/components/admin/AdminTemporalHealth";
import { AdminWorkerHealth } from "@/components/admin/AdminWorkerHealth";
import { AdminDashboardOpsEventsTable } from "@/components/admin/admin-dashboard-tables";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { ExternalLink } from "@/components/ui/ExternalLink";
import type { InstanceEmailAllowance } from "@/lib/email/allowance-model";
import type { InstanceAdminOperations } from "@/lib/queries/instance-admin-operational";
import { DOCS_URL } from "@/lib/site/site";
import { useTranslations } from "next-intl";
import { OssOpsActions, type PreviewOpsResult } from "./OssOpsActions";

export function OssOperationalDetails({
  data,
  view = "Worker",
  onSendTest,
  onRunSweep,
}: Readonly<{
  data: InstanceAdminOperations;
  emailAllowance?: InstanceEmailAllowance;
  view?: "Worker" | "Checks" | "Data sources" | "Notifications";
  onSendTest: () => PreviewOpsResult | undefined | Promise<PreviewOpsResult | undefined>;
  onRunSweep: () => PreviewOpsResult | undefined | Promise<PreviewOpsResult | undefined>;
}>) {
  const context = useDateDisplay();
  const t = useTranslations("instanceAdmin");
  const unavailable = t("values.unavailable");

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <p className="text-xs text-fg-muted">
        {t("dashboard.timeZone", { timeZone: context.timeZone })}
      </p>
      {view === "Worker" && (
        <>
          <AdminWorkerHealth
            available={data.availability.worker}
            ops={data.ops}
            worker={data.worker}
          />
          <AdminTemporalHealth temporal={data.temporal} />
        </>
      )}
      {view === "Checks" && (
        <>
          <Panel
            description={t("dashboard.rankChecks.description")}
            id="admin-rank-checks"
            title={t("dashboard.rankChecks.title")}
          >
            {!data.availability.rankChecks ? (
              <AdminSectionUnavailable>
                {t("dashboard.rankChecks.unavailable")}
              </AdminSectionUnavailable>
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
            description={t("pages.presenceHelp")}
            id="admin-url-presence"
            title={t("dashboard.presence.title")}
          >
            {!data.availability.presence ? (
              <AdminSectionUnavailable>
                {t("dashboard.presence.unavailable")}
              </AdminSectionUnavailable>
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
                  label={t("pages.lastExhaustion")}
                  value={
                    <span className="text-[13px] leading-5">
                      {displayTime(data.presence?.occurredAt ?? null, context, unavailable)}
                    </span>
                  }
                />
              </div>
            )}
          </Panel>
        </>
      )}
      {view === "Data sources" && (
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
      )}
      {view === "Notifications" && (
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
            <OssOpsActions
              onSendTest={onSendTest}
              onRunSweep={onRunSweep}
              slackConfigured={data.ops.configured && data.ops.enabled}
            />
          </div>
          {!data.availability.opsDelivery ? (
            <div className="mb-3">
              <AdminSectionUnavailable>
                {t("dashboard.ops.deliveryUnavailable")}
              </AdminSectionUnavailable>
            </div>
          ) : null}
          {!data.availability.opsEvents ? (
            <AdminSectionUnavailable>
              {t("dashboard.ops.historyUnavailable")}
            </AdminSectionUnavailable>
          ) : data.ops.events.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-fg-muted">{t("dashboard.ops.empty")}</p>
          ) : (
            <AdminDashboardOpsEventsTable events={data.ops.events} />
          )}
        </Panel>
      )}
    </div>
  );
}
