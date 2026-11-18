import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { approvalSnapshotSchema } from "@/lib/local-monitor-recurring/schema";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { scheduleNotFound } from "./errors";
import { listLocalMonitorSchedules } from "./local-monitors";
import { localMonitorUnitCents, type ReviewCadence } from "./review-cost";
import type { ScheduleChange } from "./review-load";
import { pack, quote } from "./review-load-shared";

/** A local monitor state change, priced from its stored recurring approval quote. */
export async function loadLocal(
  projectId: string,
  change: Extract<ScheduleChange, { op: "state" }>,
  projectDepth: number,
  now: Date,
  db: Prisma.TransactionClient = prisma,
) {
  const rows = await listLocalMonitorSchedules(projectId, "current", now, change.id, db);
  const row = rows.find((item) => item.id === change.id);
  if (!row) throw scheduleNotFound();
  const unit = await localRecurringUnit(projectId, change.id, db);
  const monthly = row.monthly_cost_estimate_cents;
  const cadence: ReviewCadence = {
    archived: row.state === "archived",
    cronExpression: row.cadence.cron_expression,
    enabled: row.state === "active",
    frequency: (row.cadence.frequency as ReviewCadence["frequency"]) || "manual",
    jitterMinutes: 0,
    publicId: row.id,
    serpDepth: null,
    timeOfDay: row.cadence.time_of_day ?? null,
    timezone: row.cadence.timezone,
  };
  const restore = "restore" in change.command && change.command.restore === true;
  const operation = restore
    ? "restore"
    : change.state === row.state
      ? "noop"
      : change.state === "archived"
        ? "archive"
        : change.state === "paused"
          ? "pause"
          : "update";
  const after = {
    ...cadence,
    archived: change.state === "archived",
    enabled: change.state === "active",
  };
  return pack(
    projectDepth,
    now,
    operation,
    quote(cadence, 1, unit),
    quote(after, 1, unit),
    false,
    null,
    null,
    [change.id, row.state, monthly],
  );
}

/** Per-run price from the stored recurring quote. A paused row's monthly total can be zero. */
async function localRecurringUnit(
  projectId: string,
  publicId: string,
  db: Prisma.TransactionClient,
) {
  const monitor = await db.localMonitor.findFirst({
    select: { currentScheduleIntentId: true },
    where: { projectId, publicId },
  });
  if (!monitor?.currentScheduleIntentId) return null;
  const approval = await db.localMonitorRecurringApproval.findFirst({
    select: { snapshot: true },
    where: { projectId, scheduleIntentId: monitor.currentScheduleIntentId },
  });
  if (!approval) return null;
  const parsed = approvalSnapshotSchema.safeParse(approval.snapshot);
  if (!parsed.success) return null;
  return localMonitorUnitCents(parsed.data.quote as LocalQuote);
}
