import "@/lib/local-monitor-results/acceptance.postgres.test-runtime";
import { randomUUID } from "node:crypto";
import { previewMonitorLaunch } from "@/lib/local-monitor-launch/preview";
import { readMonitorRunResult } from "@/lib/local-monitor-results/read";
import { enqueueMonitorLaunch } from "@/lib/local-monitor-worker/enqueue";
import { executeMonitorJob } from "@/lib/local-monitor-worker/runtime";
import { compareCodeUnits } from "@/lib/local-monitoring/key";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { describe, expect, it } from "vitest";
import { readMonitorRetryOptions } from "./read";
import { retryDatabase, retryTransport } from "./retry.postgres.test-fixture";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("multi-target immutable retry ordering", () => {
  it("uses one ordered two-target selection through consent, SQL, dispatch and retained read", async () => {
    const transport = retryTransport(false);
    const f = await retryDatabase(true);
    try {
      const options = await readMonitorRetryOptions(
        { projectId: f.project.publicId, monitorId: f.monitor.monitorId, runId: f.parent.publicId },
        f.writerContext,
        f.db,
      );
      const ids = [options.rows[8].targetId, options.rows[0].targetId];
      const review = await previewMonitorLaunch(
        {
          ...f.input,
          idempotencyKey: randomUUID(),
          retry: { parentRunId: f.parent.publicId, targetIds: ids },
        },
        f.writerContext,
        resolveManualLocalDriver,
        f.db,
      );
      if (review.kind !== "ready") throw new Error("Two-target retry refused.");
      expect(review.command.targetIds).toEqual([...ids].sort(compareCodeUnits));
      expect(review.command.retry?.targetIds).toEqual(review.command.targetIds);
      expect(review.command.retry?.parentExpectedCount).toBe(9);
      expect(review.expectedCount).toBe(2);
      const queued = await enqueueMonitorLaunch(review.command, f.writerContext, f.db);
      const job = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
        where: { publicId: queued.intent.id },
      });
      expect(await executeMonitorJob(job.id, f.db)).toMatchObject({ state: "complete" });
      const saved = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (!saved.runId) throw new Error("Two-target child was not persisted.");
      const child = await f.db.localMeasurementRun.findUniqueOrThrow({
        where: { id: saved.runId },
      });
      const reading = await f.readOptions();
      const report = await readMonitorRunResult(
        {
          projectId: f.project.publicId,
          monitorId: f.monitor.monitorId,
          runId: child.publicId,
          asOf: reading.now.toISOString(),
        },
        f.writerContext,
        reading,
      );
      expect(report.receipt.expectedCount).toBe(2);
      expect(report.points.map((point) => point.id).sort(compareCodeUnits)).toEqual(
        [...ids].sort(compareCodeUnits),
      );
      expect(transport.counts()).toEqual({ posts: 2, gets: 2 });
      expect(await f.db.localMonitorRetryMember.count({ where: { selectionId: job.id } })).toBe(2);
      expect(
        (await f.db.localMeasurementRun.findUniqueOrThrow({ where: { id: f.parent.id } }))
          .expectedTargetKeys,
      ).toHaveLength(9);
    } finally {
      await f.close();
    }
  });
});
