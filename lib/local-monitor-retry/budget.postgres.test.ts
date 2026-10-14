import "@/lib/local-monitor-results/acceptance.postgres.test-runtime";
import { randomUUID } from "node:crypto";
import { previewMonitorLaunch } from "@/lib/local-monitor-launch/preview";
import { enqueueMonitorLaunch } from "@/lib/local-monitor-worker/enqueue";
import { executeMonitorJob } from "@/lib/local-monitor-worker/runtime";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { cancelLocalMeasurementRun } from "@/lib/local-monitoring-store/cancel-run";
import { meteringNamespace } from "@/lib/metering/runtime";
import { putSpendingBudget } from "@/lib/metering/spending-limit-store";
import { projectSpendingBudget } from "@/lib/metering/spending-limits";
import { describe, expect, it } from "vitest";
import { admitQueuedMonitor } from "./admit.test-fixture";
import { readMonitorRetryOptions } from "./read";
import { retryDatabase, retryTransport } from "./retry.postgres.test-fixture";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("actual selected retry paid admission", () => {
  it("rechecks the native project cap and rolls back child reservation/ownership before any new POST", async () => {
    const transport = retryTransport(),
      f = await retryDatabase();
    try {
      const options = await readMonitorRetryOptions(
        { projectId: f.project.publicId, monitorId: f.monitor.monitorId, runId: f.parent.publicId },
        f.writerContext,
        f.db,
      );
      const selected = options.rows.find((r) => r.eligible);
      if (!selected) throw new Error("Original native failure missing.");
      const preview = await previewMonitorLaunch(
        {
          ...f.input,
          idempotencyKey: randomUUID(),
          retry: { parentRunId: f.parent.publicId, targetIds: [selected.targetId] },
        },
        f.writerContext,
        resolveManualLocalDriver,
        f.db,
      );
      if (preview.kind !== "ready") throw new Error("Selected retry quote missing.");
      expect(preview.nativeEstimates).toContainEqual({ unit: "cents", amount: "0.06" });
      await f.db.$transaction((tx) =>
        putSpendingBudget(tx, projectSpendingBudget(meteringNamespace(), f.project.id, "0.01", 2)),
      );
      const queued = await enqueueMonitorLaunch(preview.command, f.writerContext, f.db),
        job = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
          where: { publicId: queued.intent.id },
        });
      const beforeRuns = await f.db.localMeasurementRun.count(),
        beforeItems = await f.db.localMeasurementRunItem.count(),
        beforeOwners = await f.db.localMeasurementTargetOwner.count();
      expect(await executeMonitorJob(job.id, f.db)).toEqual({ state: "blocked", nextPollMs: null });
      expect(await f.db.localMeasurementRun.count()).toBe(beforeRuns);
      expect(await f.db.localMeasurementRunItem.count()).toBe(beforeItems);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(beforeOwners);
      expect(
        (await f.db.localMonitorLaunchIntent.findUniqueOrThrow({ where: { id: job.id } })).runId,
      ).toBeNull();
      expect(transport.counts()).toEqual({ posts: 9, gets: 7 });
    } finally {
      await f.close();
    }
  });
  it("rechecks original native/version proof at the joined first-send fence", async () => {
    const transport = retryTransport(),
      f = await retryDatabase();
    try {
      const options = await readMonitorRetryOptions(
        { projectId: f.project.publicId, monitorId: f.monitor.monitorId, runId: f.parent.publicId },
        f.writerContext,
        f.db,
      );
      const selected = options.rows.find((r) => r.eligible);
      if (!selected) throw new Error("Original native failure missing.");
      const preview = await previewMonitorLaunch(
        {
          ...f.input,
          idempotencyKey: randomUUID(),
          retry: { parentRunId: f.parent.publicId, targetIds: [selected.targetId] },
        },
        f.writerContext,
        resolveManualLocalDriver,
        f.db,
      );
      if (preview.kind !== "ready") throw new Error("Selected retry quote missing.");
      const queued = await enqueueMonitorLaunch(preview.command, f.writerContext, f.db),
        job = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
          where: { publicId: queued.intent.id },
        });
      const prepared = await admitQueuedMonitor(f, job.id);
      expect(prepared.submitters).toHaveLength(1);
      await cancelLocalMeasurementRun(
        {
          projectId: f.project.publicId,
          runId: f.parent.publicId,
          expectedVersion: f.parent.version,
        },
        f.writerContext,
        f.db,
      );
      await expect(prepared.submitters[0].submit()).rejects.toThrow();
      expect(transport.counts()).toEqual({ posts: 9, gets: 7 });
      const child = await f.db.localMeasurementRun.findUniqueOrThrow({
          where: { publicId: prepared.id },
        }),
        item = await f.db.localMeasurementRunItem.findFirstOrThrow({ where: { runId: child.id } });
      expect(item.record).toMatchObject({ status: "claimed", attemptId: null, outcome: null });
      const fence = await f.client.query<{ fenced_at: Date | null }>(
        "SELECT fenced_at FROM metering_paid_attempt_context WHERE operation_id=$1",
        [item.preparedAttemptId],
      );
      expect(fence.rows).toHaveLength(1);
      expect(fence.rows[0].fenced_at).toBeNull();
    } finally {
      await f.close();
    }
  });
});
