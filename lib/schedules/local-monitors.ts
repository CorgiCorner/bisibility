import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recurringMonitorsEnabled } from "@/lib/local-monitor-recurring/config";
import { exactCents, recurringQuoteCents } from "@/lib/local-monitor-recurring/cost";
import { approvalSnapshotSchema, calendarSchema } from "@/lib/local-monitor-recurring/schema";
import { monthlyScheduleCost } from "./list-pricing";
import type { LocalMonitorSchedule, ScheduleStateReason } from "./types";

export async function listLocalMonitorSchedules(
  projectId: string,
  status: "current" | "archived",
  now: Date,
  publicId?: string,
  db: Prisma.TransactionClient = prisma,
) {
  const monitors = await loadListedMonitors(projectId, status, publicId, db);
  const ids = monitors
    .map((row) => row.currentScheduleIntentId)
    .filter((id): id is string => id !== null);
  const [intents, approvals, jobs] = await Promise.all([
    db.localMonitorScheduleIntent.findMany({
      where: { projectId, id: { in: ids } },
      select: { id: true, mode: true, snapshot: true },
    }),
    db.localMonitorRecurringApproval.findMany({
      where: { projectId, scheduleIntentId: { in: ids } },
      select: { id: true, scheduleIntentId: true, snapshot: true, validUntil: true },
    }),
    db.localMonitorLaunchIntent.findMany({
      where: { projectId, monitorId: { in: monitors.map((row) => row.id) } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["monitorId"],
      select: { monitorId: true, createdAt: true, state: true },
    }),
  ]);
  const cursors = await db.localMonitorRecurringCursor.findMany({
    where: { projectId, approvalId: { in: approvals.map((row) => row.id) } },
    select: {
      approvalId: true,
      nextDueAt: true,
      usedCents: true,
      issuedOccurrences: true,
      reason: true,
      state: true,
    },
  });
  const policies = new Map(
    approvals.map((row) => [row.id, approvalSnapshotSchema.parse(row.snapshot)]),
  );
  const connections = await db.providerConnection.findMany({
    where: {
      projectId,
      publicId: { in: [...policies.values()].map((policy) => policy.connectionId) },
    },
    select: {
      publicId: true,
      enabled: true,
      status: true,
      credentialSource: true,
      credentialsEncrypted: true,
    },
  });
  return monitors.map((monitor): LocalMonitorSchedule => {
    const intent = intents.find((row) => row.id === monitor.currentScheduleIntentId);
    const approval = approvals.find((row) => row.scheduleIntentId === intent?.id);
    const policy = approval ? (policies.get(approval.id) ?? null) : null;
    const connection = connections.find((row) => row.publicId === policy?.connectionId);
    const cursor = cursors.find((row) => row.approvalId === approval?.id);
    const calendar = intent?.snapshot ? calendarSchema.parse(intent.snapshot) : null;
    const cadence = {
      frequency: calendar?.frequency ?? "manual",
      cron_expression: calendar?.cronExpression ?? null,
      timezone: calendar?.timezone ?? "UTC",
      time_of_day: calendar?.timeOfDay ?? null,
    };
    let reason: ScheduleStateReason | null = null;
    if (intent?.mode === "scheduled") {
      if (!recurringMonitorsEnabled()) reason = "recurring_disabled";
      else if (!approval || approval.validUntil <= now || cursor?.reason === "expired")
        reason = "approval_expired";
      else if (
        policy &&
        cursor &&
        (cursor.reason === "ceiling_exhausted" ||
          cursor.issuedOccurrences >= policy.maximumOccurrences ||
          exactCents(recurringQuoteCents(policy.quote)) >
            exactCents(policy.maximumPerOccurrenceCents) ||
          exactCents(String(cursor.usedCents)) + exactCents(recurringQuoteCents(policy.quote)) >
            exactCents(policy.maximumTotalCents))
      )
        reason = "limit_reached";
      else if (
        cursor?.reason === "connection_unavailable" ||
        !connection?.enabled ||
        connection.status !== "connected" ||
        connection.credentialSource !== "own" ||
        !connection.credentialsEncrypted
      )
        reason = "integration_disconnected";
    }
    const last = jobs.find((row) => row.monitorId === monitor.id);
    return {
      id: monitor.publicId,
      name: monitor.name,
      kind: "local_monitor",
      group: "checks",
      actions: ["read"],
      state:
        monitor.state === "archived" || intent?.mode === "archived"
          ? "archived"
          : intent?.mode === "scheduled"
            ? "active"
            : "paused",
      state_reason: reason,
      cadence,
      target: { type: "monitor", ids: [monitor.publicId] },
      settings: {},
      limits: policy
        ? {
            maximum_occurrences: policy.maximumOccurrences,
            maximum_total_cents: policy.maximumTotalCents,
            maximum_per_occurrence_cents: policy.maximumPerOccurrenceCents,
            valid_until: policy.validUntil,
          }
        : {},
      next_run_at:
        intent?.mode === "scheduled" &&
        !reason &&
        cursor?.state === "active" &&
        monitor.state !== "archived"
          ? (cursor?.nextDueAt.toISOString() ?? null)
          : null,
      last_run_at: last?.createdAt.toISOString() ?? null,
      last_run_state: last?.state ?? null,
      target_summary: { monitors: 1, targets: policy?.targetIds.length ?? 0 },
      monthly_cost_estimate_cents: policy
        ? monthlyScheduleCost(Number(recurringQuoteCents(policy.quote)), cadence)
        : null,
    };
  });
}

const monitorListSelect = {
  id: true,
  publicId: true,
  name: true,
  state: true,
  currentScheduleIntentId: true,
} as const;

async function loadListedMonitors(
  projectId: string,
  status: "current" | "archived",
  publicId?: string,
  db: Prisma.TransactionClient = prisma,
) {
  const orderBy = { publicId: "asc" as const };
  if (publicId) {
    return db.localMonitor.findMany({
      where: { projectId, publicId },
      orderBy,
      select: monitorListSelect,
    });
  }
  if (status === "current") {
    const archivedIntents = await db.localMonitorScheduleIntent.findMany({
      where: { projectId, mode: "archived" },
      select: { id: true, mode: true },
    });
    const excluded = archivedIntents.filter((row) => row.mode === "archived").map((row) => row.id);
    return db.localMonitor.findMany({
      where: {
        projectId,
        state: { not: "archived" },
        ...(excluded.length
          ? {
              OR: [
                { currentScheduleIntentId: null },
                { currentScheduleIntentId: { notIn: excluded } },
              ],
            }
          : {}),
      },
      orderBy,
      select: monitorListSelect,
    });
  }
  const [entityArchived, archivedIntents] = await Promise.all([
    db.localMonitor.findMany({
      where: { projectId, state: "archived" },
      orderBy,
      select: monitorListSelect,
    }),
    db.localMonitorScheduleIntent.findMany({
      where: { projectId, mode: "archived" },
      select: { id: true },
    }),
  ]);
  const intentIds = archivedIntents.map((row) => row.id);
  const intentArchived = intentIds.length
    ? await db.localMonitor.findMany({
        where: {
          projectId,
          state: { not: "archived" },
          currentScheduleIntentId: { in: intentIds },
        },
        orderBy,
        select: monitorListSelect,
      })
    : [];
  const seen = new Set(entityArchived.map((row) => row.id));
  return [...entityArchived, ...intentArchived.filter((row) => !seen.has(row.id))].sort((a, b) =>
    a.publicId.localeCompare(b.publicId),
  );
}
