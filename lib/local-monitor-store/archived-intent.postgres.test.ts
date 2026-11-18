import { randomUUID } from "node:crypto";
import {
  pauseRecurringMonitor,
  restoreRecurringMonitor,
} from "@/lib/local-monitor-recurring/pause";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { describe, expect, it } from "vitest";
import { monitorDatabase } from "./postgres.test-fixture";
import { setLocalMonitorScheduleIntent } from "./schedule";
import { createLocalMonitor } from "./write";

type OwnedMonitor = Awaited<ReturnType<typeof monitorDatabase>>;

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
const columns = `id,"projectId","monitorId","definitionRevisionId","previousRevisionId",revision,mode,"scheduleId",snapshot,"approvalDigest","capabilityVersion"`;

async function archiveMonitor(f: OwnedMonitor, monitorId: string, expectedVersion: number) {
  await setLocalMonitorScheduleIntent(
    {
      projectId: f.project.publicId,
      monitorId,
      consentToken: null,
      expectedScheduleEpoch: null,
      expectedVersion,
      idempotencyKey: randomUUID(),
      mode: "archived",
      scheduleId: null,
    },
    f.writerContext,
    {
      verify: async () => {
        throw new Error("An archived schedule has no paid authority.");
      },
    },
    { db: f.db },
  );
}

function pauseCommand(f: OwnedMonitor, monitorId: string, expectedVersion: number) {
  return {
    expectedVersion,
    idempotencyKey: randomUUID(),
    monitorId,
    projectId: f.project.publicId,
  };
}

async function currentIntent(f: OwnedMonitor, monitorId: string) {
  const monitor = await f.db.localMonitor.findFirstOrThrow({
    where: { publicId: monitorId },
  });
  const intent = await f.db.localMonitorScheduleIntent.findFirstOrThrow({
    where: { id: monitor.currentScheduleIntentId ?? "" },
  });
  return { intent, monitor };
}

suite("archived schedule intent constraint", () => {
  it("accepts a null archived intent and rejects snapshot, schedule id, and an unknown mode", async () => {
    const f = await monitorDatabase();
    try {
      const created = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
      const ref = { projectId: f.project.publicId, monitorId: created.receipt.monitorId };
      await setLocalMonitorScheduleIntent(
        {
          ...ref,
          consentToken: null,
          expectedScheduleEpoch: null,
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
          mode: "archived",
          scheduleId: null,
        },
        f.writerContext,
        {
          verify: async () => {
            throw new Error("An archived schedule has no paid authority.");
          },
        },
        { db: f.db },
      );
      const monitor = await f.db.localMonitor.findFirstOrThrow({
        where: { publicId: created.receipt.monitorId },
      });
      const intent = await f.db.localMonitorScheduleIntent.findFirstOrThrow({
        where: { id: monitor.currentScheduleIntentId ?? "" },
      });
      expect(intent).toMatchObject({
        approvalDigest: null,
        capabilityVersion: null,
        mode: "archived",
        scheduleId: null,
        snapshot: null,
      });
      const constraint = await f.client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'local_monitor_schedule_intents'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%archived%'`,
      );
      expect(constraint.rows.map((row) => row.conname)).toEqual([
        "local_monitor_schedule_intents_mode_check",
      ]);
      const next = [
        monitor.projectId,
        monitor.id,
        intent.definitionRevisionId,
        intent.id,
        intent.revision + 1,
      ];
      await expect(
        f.client.query(
          `INSERT INTO local_monitor_schedule_intents (${columns})
           VALUES ($1,$2,$3,$4,$5,$6,'archived',NULL,'{"measurementEpoch":"1"}'::jsonb,NULL,NULL)`,
          [randomUUID(), ...next],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.query(
          `INSERT INTO local_monitor_schedule_intents (${columns})
           VALUES ($1,$2,$3,$4,$5,$6,'archived',$7,NULL,NULL,NULL)`,
          [randomUUID(), ...next, f.schedule.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.query(
          `INSERT INTO local_monitor_schedule_intents (${columns})
           VALUES ($1,$2,$3,$4,$5,$6,'deleted',NULL,NULL,NULL,NULL)`,
          [randomUUID(), ...next],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await f.close();
    }
  }, 120_000);

  it("refuses a plain pause of an archived monitor and restores only through the explicit restore", async () => {
    const f = await monitorDatabase();
    try {
      const manual = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
      const paused = await createLocalMonitor(
        { ...f.command, idempotencyKey: randomUUID() },
        f.writerContext,
        { db: f.db },
      );
      await pauseRecurringMonitor(
        pauseCommand(f, paused.receipt.monitorId, 1),
        f.writerContext,
        f.db,
      );
      await archiveMonitor(f, manual.receipt.monitorId, 1);
      await archiveMonitor(f, paused.receipt.monitorId, 2);
      const archived = [
        await currentIntent(f, manual.receipt.monitorId),
        await currentIntent(f, paused.receipt.monitorId),
      ];
      expect(archived.map((row) => row.intent.mode)).toEqual(["archived", "archived"]);
      for (const row of archived) {
        await expect(
          pauseRecurringMonitor(
            pauseCommand(f, row.monitor.publicId, row.monitor.version),
            f.writerContext,
            f.db,
          ),
        ).rejects.toBeInstanceOf(LocalMonitorConflictError);
        const unchanged = await currentIntent(f, row.monitor.publicId);
        expect(unchanged.intent.id).toBe(row.intent.id);
        expect(unchanged.monitor.version).toBe(row.monitor.version);
      }
      for (const row of archived) {
        await restoreRecurringMonitor(
          pauseCommand(f, row.monitor.publicId, row.monitor.version),
          f.writerContext,
          f.db,
        );
      }
      for (const row of archived) {
        const prior = await f.db.localMonitorScheduleIntent.findFirstOrThrow({
          where: { id: row.intent.id },
        });
        expect(prior.mode).toBe("archived");
        const restored = await currentIntent(f, row.monitor.publicId);
        expect(restored.intent.previousRevisionId).toBe(row.intent.id);
        expect(restored.intent).toMatchObject({
          approvalDigest: null,
          capabilityVersion: null,
          mode: "paused",
          scheduleId: null,
          snapshot: null,
        });
      }
    } finally {
      await f.close();
    }
  }, 120_000);
});
