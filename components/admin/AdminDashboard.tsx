import { AdminFailureBreakdown } from "@/components/admin/AdminFailureBreakdown";
import { AdminHealthPills } from "@/components/admin/AdminHealthPills";
import { AdminOpsActions } from "@/components/admin/AdminOpsActions";
import { Badge, displayTime, Metric, Panel, RankWindow } from "@/components/admin/AdminPrimitives";
import { AdminProviderHealth } from "@/components/admin/AdminProviderHealth";
import { AdminProviderUsageTable } from "@/components/admin/AdminProviderUsageTable";
import { AdminSectionUnavailable } from "@/components/admin/AdminSectionUnavailable";
import { AdminWorkerHealth } from "@/components/admin/AdminWorkerHealth";
import { MonoText } from "@/components/ui";
import { checkFailureRate } from "@/lib/ops/instance-admin-health";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";

const snapshotTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function connectionKindLabel(kind: string) {
  return kind
    .split(/[_-]/)
    .map((word) =>
      word.length <= 4 ? word.toUpperCase() : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
}

export function AdminDashboard({ data }: Readonly<{ data: InstanceAdminDashboard }>) {
  const temporalHeartbeat = data.temporal.status === "ok" ? data.temporal.heartbeat : null;
  const temporalSnapshotNote = data.temporal.status === "stale" ? "Temporal snapshot stale" : null;
  const temporalIssues = [
    ...(temporalSnapshotNote ? [temporalSnapshotNote] : []),
    ...(temporalHeartbeat?.issueSchedules ?? []),
    ...data.temporal.bootstrapErrors,
  ];
  const checkFailureRatePercent = data.availability.rankChecks
    ? checkFailureRate(data.rank24h.failed, data.rank24h.succeeded)
    : null;
  const unavailable = displayTime(null);

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
        description="Execution totals and schedule-to-start lag. Deferred rows never count as successes."
        title="Rank checks"
      >
        {!data.availability.rankChecks ? (
          <AdminSectionUnavailable>Rank-check diagnostics are unavailable.</AdminSectionUnavailable>
        ) : (
          <div className="space-y-5">
            <RankWindow data={data.rank24h} label="Last 24 hours" />
            <RankWindow data={data.rank7d} label="Last 7 days" />
            <div>
              <h3 className="text-sm font-semibold text-fg">Failures (24h)</h3>
              <p className="mt-1 text-xs text-fg-muted">
                Checks that failed after exhausting all providers. Grouped by provider and
                summarized reason.
              </p>
              <div className="mt-2">
                <AdminFailureBreakdown
                  breakdown={data.rank24h.failureBreakdown}
                  now={data.generatedAt}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Fallbacks (24h)</h3>
              <p className="mt-1 text-xs text-fg-muted">
                Checks that completed only after a primary provider failed. Grouped by the provider
                that failed and the summarized reason.
              </p>
              <div className="mt-2">
                <AdminFailureBreakdown
                  breakdown={data.rank24h.fallbackBreakdown}
                  emptyLabel="No fallback rank checks in the last 24 hours."
                  now={data.generatedAt}
                />
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        description="Per-provider sync health across all connections. Per-connection detail is available only through Account lookup."
        title="Data sources"
      >
        {!data.availability.dataSources ? (
          <AdminSectionUnavailable>
            Data-source diagnostics are unavailable.
          </AdminSectionUnavailable>
        ) : (
          <AdminProviderHealth rows={data.providerHealth} />
        )}
      </Panel>

      <Panel
        description="Latest property-budget deferral from the daily URL-presence workflow. The budget resets automatically."
        title="URL presence"
      >
        {!data.availability.presence ? (
          <AdminSectionUnavailable>
            URL-presence diagnostics are unavailable.
          </AdminSectionUnavailable>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Deferred URLs" value={data.presence?.deferred ?? unavailable} />
            <Metric
              label="Affected projects"
              value={data.presence?.affectedProjects ?? unavailable}
            />
            <Metric
              label="Last budget exhaustion"
              value={
                <span className="text-sm">{displayTime(data.presence?.occurredAt ?? null)}</span>
              }
            />
          </div>
        )}
      </Panel>

      <Panel
        description="Temporal schedule inspection and recorded bootstrap failures."
        title="Temporal"
      >
        <p className="mb-3 text-xs text-fg-muted">
          {data.temporal.collectedAt
            ? `As of ${snapshotTime.format(new Date(data.temporal.collectedAt))}`
            : unavailable}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Schedules" value={temporalHeartbeat?.schedules ?? unavailable} />
          <Metric label="Recent actions" value={temporalHeartbeat?.recentActions ?? unavailable} />
          <Metric
            label="Missed catchup"
            value={temporalHeartbeat?.missedCatchupTotal ?? unavailable}
          />
          <Metric
            label="Skipped overlap"
            value={temporalHeartbeat?.skippedOverlapTotal ?? unavailable}
          />
          <Metric
            label="Inspection errors"
            value={temporalHeartbeat?.inspectionErrors ?? unavailable}
          />
          <Metric
            label="Next action"
            value={
              <span className="text-sm">
                {temporalHeartbeat ? displayTime(temporalHeartbeat.nextActionAt) : unavailable}
              </span>
            }
          />
        </div>
        {data.temporal.status === "unavailable" ? (
          <p className="mt-3 rounded-xl bg-yellow/10 p-3 text-xs text-yellow-text">
            Snapshot unavailable {"-"} worker has not published Temporal data. Values above are
            unknown, not zero.
          </p>
        ) : null}
        {data.temporal.status === "disabled" ? (
          <p className="mt-3 rounded-xl bg-bg-sunken p-3 text-xs text-fg-muted">
            Temporal scheduling is disabled for this topology.
          </p>
        ) : null}
        {temporalIssues.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-xl bg-bg-sunken p-3 font-mono text-[11px] text-fg-muted">
            {temporalIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel
        description="Recent operator events show delivery metadata only; free-form payload fields are never exposed here."
        title="Ops events"
      >
        <div className="mb-3">
          <AdminOpsActions slackConfigured={data.ops.configured && data.ops.enabled} />
        </div>
        {!data.availability.opsDelivery ? (
          <div className="mb-3">
            <AdminSectionUnavailable>Delivery diagnostics are unavailable.</AdminSectionUnavailable>
          </div>
        ) : null}
        {!data.availability.opsEvents ? (
          <AdminSectionUnavailable>
            Operational event history is unavailable.
          </AdminSectionUnavailable>
        ) : data.ops.events.length === 0 ? (
          <p className="text-xs text-fg-muted">No operational events recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-border text-fg-muted">
                <tr>
                  <th className="pb-2 pr-3">Kind</th>
                  <th className="pb-2 pr-3">Severity</th>
                  <th className="pb-2 pr-3">Created</th>
                  <th className="pb-2 pr-3">Delivery</th>
                  <th className="pb-2">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {data.ops.events.map((event, index) => (
                  <tr
                    className="border-b border-border-soft last:border-0"
                    key={`${event.createdAt}:${event.kind}:${index}`}
                  >
                    <td className="py-2 pr-3">
                      <MonoText>{event.kind}</MonoText>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge status={event.severity} />
                    </td>
                    <td className="py-2 pr-3 text-fg-muted">{displayTime(event.createdAt)}</td>
                    <td className="py-2 pr-3">
                      <Badge status={event.deliveredAt ? "delivered" : "undelivered"} />
                    </td>
                    <td className="py-2 font-mono text-fg-muted">{event.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        description="Instance counts and completed SERP usage for the current UTC month."
        title="Instance stats"
      >
        {!data.availability.stats ? (
          <AdminSectionUnavailable>Instance statistics are unavailable.</AdminSectionUnavailable>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              <Metric label="Users" value={data.stats.users} />
              <Metric label="Projects" value={data.stats.projects} />
              <Metric label="Keywords" value={data.stats.keywords} />
              {data.stats.activeProviderConnectionsByKind.map((connection) => (
                <Metric
                  key={connection.kind}
                  label={`${connectionKindLabel(connection.kind)} connections`}
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
