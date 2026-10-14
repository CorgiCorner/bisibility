import { randomUUID } from "node:crypto";
import { monitorDatabase } from "@/lib/local-monitor-store/postgres.test-fixture";
import { createLocalMonitor } from "@/lib/local-monitor-store/write";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewRecurringMonitor } from "./preview";
import { readRecurringMonitor } from "./read";

const factory = vi.hoisted(() => vi.fn());
vi.mock("@/lib/local-monitoring-host/manual-driver", () => ({
  resolveManualLocalDriver: factory,
}));
afterEach(() => vi.unstubAllEnvs());
const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("recurring authority on the actual isolated migrated schema", () => {
  it("keeps manual read without paid approval and denies a viewer before factory resolution", async () => {
    const fixture = await monitorDatabase();
    try {
      vi.stubEnv("LOCAL_MONITOR_RECURRING_ENABLED", "true");
      vi.stubEnv("SCHEDULER_DRIVER", "worker");
      const created = await createLocalMonitor(fixture.command, fixture.writerContext, {
        db: fixture.db,
      });
      const ref = { projectId: fixture.project.publicId, monitorId: created.receipt.monitorId };
      expect(
        (await readRecurringMonitor(ref, fixture.ownerContext, fixture.db)).approval,
      ).toBeNull();
      await expect(
        previewRecurringMonitor(
          {
            ...ref,
            expectedVersion: 1,
            connectionId: "conn_abcdefghijklmnopqrstuvwx",
            idempotencyKey: randomUUID(),
            scheduleId: fixture.schedule.publicId,
            expectedScheduleEpoch: String(fixture.schedule.measurementEpoch),
            maximumPerOccurrenceCents: "0.06",
            maximumTotalCents: "0.12",
            maximumOccurrences: 2,
            validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
            catchUp: "skip_elapsed",
          },
          fixture.ownerContext,
          fixture.db,
        ),
      ).rejects.toThrow();
      expect(factory).not.toHaveBeenCalled();
      const count = await fixture.client.query(
        'SELECT count(*)::integer AS n FROM public.local_monitor_recurring_approvals WHERE "projectId"=$1',
        [fixture.project.id],
      );
      expect(count.rows[0].n).toBe(0);
    } finally {
      await fixture.close();
    }
  }, 120000);
  it("rejects foreign schedule/definition authority without inserting a valid approval or marker", async () => {
    const fixture = await monitorDatabase();
    try {
      const created = await createLocalMonitor(fixture.command, fixture.writerContext, {
        db: fixture.db,
      });
      const monitor = await fixture.db.localMonitor.findFirstOrThrow({
        where: { projectId: fixture.project.id, publicId: created.receipt.monitorId },
      });
      await expect(
        fixture.client.query(
          `INSERT INTO public.local_monitor_recurring_approvals
        (id,"projectId","monitorId","scheduleIntentId","definitionRevisionId","monitorVersion","actorId",snapshot,"contentHash","approvalDigest","approvedAt","validUntil")
        VALUES($1,$2,$3,$4,$5,1,$6,'{}'::jsonb,$7,$7,now(),now()+interval '1 day')`,
          [
            randomUUID(),
            fixture.project.id,
            monitor.id,
            "foreign-intent",
            "foreign-definition",
            fixture.writer.id,
            "a".repeat(64),
          ],
        ),
      ).rejects.toThrow();
      const count = await fixture.client.query(
        'SELECT count(*)::integer AS n FROM public.local_monitor_recurring_approvals WHERE "projectId"=$1',
        [fixture.project.id],
      );
      expect(count.rows[0].n).toBe(0);
    } finally {
      await fixture.close();
    }
  }, 120000);
});
