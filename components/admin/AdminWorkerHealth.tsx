import { Badge, displayTime, Metric, Panel } from "@/components/admin/AdminPrimitives";
import { AdminSectionUnavailable } from "@/components/admin/AdminSectionUnavailable";
import { MonoText } from "@/components/ui";
import type { MigrationComparison } from "@/lib/db/migration-state";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";

function schemaStatus(comparison: MigrationComparison) {
  if (comparison === "ok") return { label: "In sync", tone: "ok" };
  if (comparison === "worker-behind") return { label: "Worker behind", tone: "error" };
  if (comparison === "worker-ahead") return { label: "Worker ahead", tone: "warning" };
  return { label: "Unknown", tone: "unknown" };
}

function migrationName(value: string | null) {
  return value ?? "-";
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
  const schema = schemaStatus(worker.schemaComparison);

  return (
    <Panel
      description="Worker heartbeat, deployment identity, database schema agreement, and Slack delivery configuration."
      title="Worker"
    >
      {!available ? (
        <AdminSectionUnavailable>Worker diagnostics are unavailable.</AdminSectionUnavailable>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Status" value={<Badge status={worker.status} />} />
          <Metric
            label="Last heartbeat"
            value={<span className="text-sm">{displayTime(worker.lastSeenAt)}</span>}
          />
          <Metric label="Release" value={<MonoText>{worker.release}</MonoText>} />
          <Metric label="Environment" value={<MonoText>{worker.environment}</MonoText>} />
          <Metric
            label="Schema status"
            value={<Badge status={schema.tone}>{schema.label}</Badge>}
          />
          <Metric
            label="Bundled migration"
            value={<MonoText>{migrationName(worker.bundledMigration)}</MonoText>}
          />
          <Metric
            label="Applied migration"
            value={<MonoText>{migrationName(worker.appliedMigration)}</MonoText>}
          />
          <Metric
            label="Slack ops"
            value={
              <Badge status={ops.enabled ? "ok" : "unknown"}>
                {ops.configured ? (ops.enabled ? "Configured" : "Disabled") : "Not configured"}
              </Badge>
            }
          />
        </div>
      )}
    </Panel>
  );
}
