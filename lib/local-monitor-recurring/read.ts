import "server-only";
import { prisma } from "@/lib/db/prisma";
import { readMonitorSchema } from "@/lib/local-monitor-store/schema";
import { loadMonitorSnapshot } from "@/lib/local-monitor-store/snapshot";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { z } from "zod";
import { recurringMonitorsEnabled } from "./config";
import { loadRecurringApproval } from "./repository";

type PublicRecurringApproval = {
  maximumPerOccurrenceCents: string;
  maximumTotalCents: string;
  maximumOccurrences: number;
  validUntil: string;
  nextDueAt: string;
  issuedCents: string;
  issuedOccurrences: number;
  state: "active" | "blocked" | "finished";
  reason: string | null;
};
const cursorSchema = z.object({
  nextDueAt: z.date(),
  usedCents: z.string(),
  issuedOccurrences: z.number().int(),
  state: z.enum(["active", "blocked", "finished"]),
  reason: z.string().nullable(),
});
/** Stored display/choices only. Neither due production nor quote/target materialization is reachable. */
export async function readRecurringMonitor(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const command = readMonitorSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, command.projectId, "read"),
      { monitor, intent } = await loadMonitorSnapshot(tx, scope.project.id, command.monitorId);
    const schedules = await tx.checkSchedule.findMany({
      where: {
        projectId: scope.project.id,
        enabled: true,
        archivedAt: null,
        frequency: { in: ["daily", "weekly", "monthly", "custom_cron"] },
      },
      select: { publicId: true, name: true, measurementEpoch: true, timezone: true },
      orderBy: { publicId: "asc" },
      take: 51,
    });
    const connections = await tx.providerConnection.findMany({
      where: {
        projectId: scope.project.id,
        kind: "serp",
        provider: "dataforseo",
        enabled: true,
        status: "connected",
        credentialSource: "own",
      },
      select: { publicId: true, provider: true },
      orderBy: { publicId: "asc" },
      take: 51,
    });
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM local_monitor_recurring_approvals WHERE "projectId"=${scope.project.id} AND "monitorId"=${monitor.id} AND "scheduleIntentId"=${intent.id}`;
    let approval: PublicRecurringApproval | null = null;
    if (rows[0]) {
      const record = await loadRecurringApproval(tx, rows[0].id),
        cursors = await tx.$queryRaw<
          unknown[]
        >`SELECT "nextDueAt","usedCents"::text AS "usedCents","issuedOccurrences",state,reason FROM local_monitor_recurring_cursors WHERE "approvalId"=${record.id} AND "projectId"=${scope.project.id}`;
      const cursor = cursorSchema.parse(cursors[0]);
      approval = {
        maximumPerOccurrenceCents: record.snapshot.maximumPerOccurrenceCents,
        maximumTotalCents: record.snapshot.maximumTotalCents,
        maximumOccurrences: record.snapshot.maximumOccurrences,
        validUntil: record.validUntil.toISOString(),
        nextDueAt: cursor.nextDueAt.toISOString(),
        issuedCents: cursor.usedCents,
        issuedOccurrences: cursor.issuedOccurrences,
        state: cursor.state,
        reason: cursor.reason,
      };
    }
    return {
      enabled: recurringMonitorsEnabled(),
      mode: intent.mode,
      version: monitor.version,
      approval,
      schedules: schedules.slice(0, 50).map((row) => ({
        id: row.publicId,
        name: row.name,
        epoch: String(row.measurementEpoch),
        timezone: row.timezone,
      })),
      connections: connections
        .slice(0, 50)
        .map((row) => ({ id: row.publicId, provider: row.provider })),
      choicesTruncated: schedules.length > 50 || connections.length > 50,
    };
  });
}
