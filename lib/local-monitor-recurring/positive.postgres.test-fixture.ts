import { randomUUID } from "node:crypto";
import { makePublicId, requirePublicId } from "@/lib/db/public-id-resources";
import { nativeOccurrenceKey } from "@/lib/local-monitor-launch/identity";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import { monitorDatabase } from "@/lib/local-monitor-store/postgres.test-fixture";
import { createLocalMonitor } from "@/lib/local-monitor-store/write";
import { monitorWorkerBinding } from "@/lib/local-monitor-worker/binding";
import { claimMonitorJob } from "@/lib/local-monitor-worker/claim";
import { loadMonitorJob } from "@/lib/local-monitor-worker/repository";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import { prepareLocalMeasurementRun } from "@/lib/local-monitoring-store/prepare-run";
import { ensureProjectSpendingBudget } from "@/lib/metering/project-budget-bootstrap";
import { meteringNamespace } from "@/lib/metering/runtime";
import { encryptSecret } from "@/lib/providers/crypto";
import { approveRecurringMonitor } from "./approve";
import { previewRecurringMonitor } from "./preview";
import { readRecurringMonitor } from "./read";

/** Actual whole migrated DB and registered Maps/native Meter; the test owns HTTP and clock only. */
export async function positiveRecurringDatabase() {
  const f = await monitorDatabase();
  try {
    const ready = await f.client.query<{ ready: boolean }>(`SELECT
      to_regclass('public.local_monitor_recurring_approvals') IS NOT NULL
      AND to_regclass('public.local_monitor_launch_intents') IS NOT NULL
      AND to_regclass('public.local_original_submit_proofs') IS NOT NULL AS ready`);
    if (!ready.rows[0]?.ready)
      throw new Error(
        "Integrate the full reviewed monitor/worker/recurring migrations before running this suite.",
      );
    const timezone = await f.client.query<{ zone: string }>(
      "SELECT current_setting('TimeZone') AS zone",
    );
    if (timezone.rows[0]?.zone !== "UTC")
      throw new Error("Owned recurring PostgreSQL must use canonical UTC sessions.");
    const writerZone = await f.db.$transaction(
      (tx) => tx.$queryRaw<Array<{ zone: string }>>`SELECT current_setting('TimeZone') AS zone`,
    );
    if (writerZone[0]?.zone !== "UTC")
      throw new Error("Actual Prisma writer must use canonical UTC sessions.");
    const schedule = await f.db.checkSchedule.update({
      where: { id: f.schedule.id },
      data: {
        frequency: "custom_cron",
        cronExpression: "* * * * *",
        timezone: "America/New_York",
        timeOfDay: null,
        jitterMinutes: 0,
      },
    });
    const connection = await f.db.providerConnection.create({
      data: {
        projectId: f.project.id,
        publicId: makePublicId("conn"),
        provider: "dataforseo",
        kind: "serp",
        enabled: true,
        status: "connected",
        credentialSource: "own",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({
            login: "synthetic@example.test",
            password: "not-a-real-provider-secret",
          }),
        ),
      },
    });
    // This is an ordinary real creation path. Paid admission itself must not restore a missing cap.
    await f.db.$transaction((tx) =>
      ensureProjectSpendingBudget(tx, meteringNamespace(), f.project.id),
    );
    const monitor = async (name = "Positive scheduled monitor") =>
      createLocalMonitor(
        {
          ...f.command,
          idempotencyKey: randomUUID(),
          definition: {
            ...f.command.definition,
            name,
            axes: { ...f.command.definition.axes, operatingSystem: "windows" },
          },
        },
        f.writerContext,
        { db: f.db },
      );
    async function approve(name?: string) {
      const made = await monitor(name);
      const reviewed = await previewRecurringMonitor(
        {
          projectId: f.project.publicId,
          monitorId: made.receipt.monitorId,
          expectedVersion: made.receipt.version,
          connectionId: connection.publicId,
          scheduleId: schedule.publicId,
          expectedScheduleEpoch: String(schedule.measurementEpoch),
          maximumPerOccurrenceCents: "1",
          maximumTotalCents: "2",
          maximumOccurrences: 2,
          validUntil: new Date(Date.now() + 3600000).toISOString(),
          catchUp: "skip_elapsed",
          idempotencyKey: randomUUID(),
        },
        f.writerContext,
        f.db,
      );
      if (reviewed.kind !== "ready")
        throw new Error(`Registered fixture Maps review refused: ${reviewed.reason}`);
      const saved = await approveRecurringMonitor(reviewed.command, f.writerContext, f.db);
      const rows = await f.client.query<{ id: string }>(
        `SELECT id FROM public.local_monitor_recurring_approvals WHERE "projectId"=$1 AND "monitorId"=(SELECT id FROM public.local_monitors WHERE "publicId"=$2)`,
        [f.project.id, made.receipt.monitorId],
      );
      if (rows.rows.length !== 1) throw new Error("Real immutable approval missing.");
      return { id: rows.rows[0].id, monitorId: made.receipt.monitorId, reviewed, saved };
    }
    async function cursor(id: string) {
      const rows = await f.client.query<{
        nextDueAt: Date;
        nextOccurrenceKey: string;
        usedCents: string;
        issuedOccurrences: number;
        state: string;
        reason: string | null;
      }>(
        `SELECT "nextDueAt" AT TIME ZONE 'UTC' AS "nextDueAt","nextOccurrenceKey","usedCents"::text AS "usedCents","issuedOccurrences",state,reason FROM public.local_monitor_recurring_cursors WHERE "approvalId"=$1`,
        [id],
      );
      if (rows.rows.length !== 1) throw new Error("Real recurring cursor missing.");
      return rows.rows[0];
    }
    async function jobs(id: string) {
      const rows = await f.client.query<{
        id: string;
        runId: string | null;
        state: string;
        command: unknown;
      }>(
        `SELECT id,"runId",state,command FROM public.local_monitor_launch_intents WHERE "recurringApprovalId"=$1 ORDER BY "createdAt",id`,
        [id],
      );
      return rows.rows;
    }
    async function holdOriginal(jobId: string) {
      const clock = () => new Date();
      const claim = await claimMonitorJob(jobId, f.db, clock);
      if (!claim) throw new Error("Canonical worker claim refused.");
      const prepared = await f.db.$transaction(async (tx) => {
        const job = await loadMonitorJob(tx, jobId);
        if (!job?.actorId) throw new Error("Actual queued actor missing.");
        const context = { actor: { id: job.actorId } };
        const scope = await localProjectScope(tx, context, job.command.projectId, "create");
        const snapshot = await currentMonitorLaunchSnapshot(tx, scope, job.command);
        const resolved = await resolveManualLocalDriver(tx, {
          scope,
          definition: snapshot.definition,
          connectionPublicId: job.command.connectionId,
          source: "worker",
          trigger: "scheduled",
        });
        if (resolved.kind !== "ready") throw new Error("Current registered worker driver refused.");
        return { job, context, driver: resolved.driver };
      });
      const run = await prepareLocalMeasurementRun(
        {
          projectId: prepared.job.command.projectId,
          connectionId: prepared.job.command.connectionId,
          targetIds: prepared.job.command.targetIds,
          quote: prepared.job.command.quote,
          idempotencyKey: nativeOccurrenceKey(prepared.job.command),
          source: "worker",
          trigger: "scheduled",
        },
        prepared.context,
        prepared.driver.ports,
        f.db,
        {
          binding: monitorWorkerBinding(claim, clock),
          adapterForItem: prepared.driver.bindPreparedItem,
        },
      );
      return run; // Real reserved/owned/unfenced work. Never invoke its freshly granted submitters.
    }
    async function storedRead(monitorId: string) {
      return readRecurringMonitor(
        { projectId: requirePublicId(f.project.publicId, "prj"), monitorId },
        f.writerContext,
        f.db,
      );
    }
    return { ...f, connection, schedule, approve, cursor, jobs, holdOriginal, storedRead };
  } catch (error) {
    await f.close();
    throw error;
  }
}
