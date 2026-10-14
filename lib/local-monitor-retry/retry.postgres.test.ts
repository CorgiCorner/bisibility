import "@/lib/local-monitor-results/acceptance.postgres.test-runtime";
import { randomUUID } from "node:crypto";
import { previewMonitorLaunch } from "@/lib/local-monitor-launch/preview";
import { exportLocalRunResult } from "@/lib/local-monitor-results/export";
import { readMonitorRunResult } from "@/lib/local-monitor-results/read";
import { enqueueMonitorLaunch } from "@/lib/local-monitor-worker/enqueue";
import { executeMonitorJob } from "@/lib/local-monitor-worker/runtime";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { describe, expect, it } from "vitest";
import { readMonitorRetryOptions } from "./read";
import { retryDatabase, retryTransport } from "./retry.postgres.test-fixture";
import { assertRetrySqlNegatives } from "./sql-negative.test-fixture";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("real failed subset: retained native authority to child report", () => {
  it("purchases only one proven rejected original, preserves9 parent targets and never repurchases accepted/unknown", async () => {
    const transport = retryTransport(),
      f = await retryDatabase();
    try {
      const before = transport.counts();
      expect(before).toEqual({ posts: 9, gets: 7 });
      const options = await readMonitorRetryOptions(
        { projectId: f.project.publicId, monitorId: f.monitor.monitorId, runId: f.parent.publicId },
        f.writerContext,
        f.db,
      );
      expect(options.parentExpectedCount).toBe(9);
      expect(options.rows.filter((r) => r.eligible)).toHaveLength(1);
      const selected = options.rows.find((r) => r.eligible);
      if (!selected) throw new Error("Native rejected task missing.");
      expect(selected).toMatchObject({
        status: "rejected",
        financialState: "settled",
        reason: "eligible_rejected",
      });
      expect(options.rows.filter((r) => r.reason === "unknown_acceptance")).toHaveLength(1);
      const input = {
        ...f.input,
        idempotencyKey: randomUUID(),
        retry: { parentRunId: f.parent.publicId, targetIds: [selected.targetId] },
      };
      for (const row of options.rows.filter((r) => !r.eligible))
        await expect(
          previewMonitorLaunch(
            { ...input, retry: { ...input.retry, targetIds: [row.targetId] } },
            f.writerContext,
            resolveManualLocalDriver,
            f.db,
          ),
        ).rejects.toThrow();
      expect(transport.counts()).toEqual(before);
      await f.readOptions();
      const review = await previewMonitorLaunch(
        input,
        f.writerContext,
        resolveManualLocalDriver,
        f.db,
      );
      if (review.kind !== "ready") throw new Error("Fresh retry quote refused.");
      expect(review.expectedCount).toBe(1);
      expect(review.command.retry?.parentExpectedCount).toBe(9);
      expect(review.nativeEstimates).toContainEqual({ unit: "cents", amount: "0.06" });
      const queued = await enqueueMonitorLaunch(review.command, f.writerContext, f.db);
      const replay = await enqueueMonitorLaunch(review.command, f.writerContext, f.db);
      expect(replay.replayed).toBe(true);
      const job = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
        where: { publicId: queued.intent.id },
      });
      expect(await executeMonitorJob(job.id, f.db)).toMatchObject({ state: "complete" });
      expect(transport.counts()).toEqual({ posts: 10, gets: 8 });
      await executeMonitorJob(job.id, f.db);
      expect(transport.counts()).toEqual({ posts: 10, gets: 8 });
      const saved = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (!saved.runId) throw new Error("Actual child run missing.");
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
      expect(report.receipt.expectedCount).toBe(1);
      expect(report.points).toHaveLength(1);
      expect(report.points[0]).toMatchObject({
        id: selected.targetId,
        ordinal: selected.ordinal,
        row: selected.row,
        column: selected.column,
        position: 3,
      });
      expect(report.grids[0]).toMatchObject({
        expected: 1,
        pointIds: [selected.targetId],
        observedRate: 1,
      });
      expect(JSON.parse(exportLocalRunResult(report, "json").text).points).toHaveLength(1);
      expect(exportLocalRunResult(report, "csv").text.split("\r\n")).toHaveLength(3);
      expect(
        (await f.db.localMeasurementRun.findUniqueOrThrow({ where: { id: f.parent.id } }))
          .expectedTargetKeys,
      ).toEqual(f.parent.expectedTargetKeys);
      expect(await f.db.localMeasurementTarget.count({ where: { projectId: f.project.id } })).toBe(
        9,
      );
      expect(await f.db.localMonitorRetryMember.count({ where: { selectionId: job.id } })).toBe(1);
      await assertRetrySqlNegatives(f.db, job.id);
      await expect(
        f.db
          .$executeRaw`UPDATE local_monitor_retry_selections SET "parentExpectedCount"=8 WHERE id=${job.id}`,
      ).rejects.toThrow(/Immutable monitor retry/);
      await expect(
        f.db
          .$executeRaw`UPDATE local_monitor_retry_members SET "recordVersion"="recordVersion"+1 WHERE "selectionId"=${job.id}`,
      ).rejects.toThrow(/Immutable monitor retry/);
    } finally {
      await f.close();
    }
  });
  it("fresh authorization, changed source and expired consent refuse without any new provider call", async () => {
    const transport = retryTransport(),
      f = await retryDatabase();
    try {
      const options = await readMonitorRetryOptions(
        { projectId: f.project.publicId, monitorId: f.monitor.monitorId, runId: f.parent.publicId },
        f.writerContext,
        f.db,
      );
      const selected = options.rows.find((r) => r.eligible);
      if (!selected) throw new Error("Native rejected task missing.");
      const input = {
        ...f.input,
        idempotencyKey: randomUUID(),
        retry: { parentRunId: f.parent.publicId, targetIds: [selected.targetId] },
      };
      await expect(
        previewMonitorLaunch(input, f.ownerContext, resolveManualLocalDriver, f.db),
      ).rejects.toThrow();
      await expect(
        previewMonitorLaunch(
          { ...input, monitorId: "lmn_abcdefghijklmnopqrstuvwx" },
          f.writerContext,
          resolveManualLocalDriver,
          f.db,
        ),
      ).rejects.toThrow();
      const review = await previewMonitorLaunch(
        input,
        f.writerContext,
        resolveManualLocalDriver,
        f.db,
      );
      if (review.kind !== "ready") throw new Error("Retry quote refused.");
      await expect(
        enqueueMonitorLaunch(
          {
            ...review.command,
            retry: { ...review.command.retry, selectedProofHash: "a".repeat(64) },
          },
          f.writerContext,
          f.db,
        ),
      ).rejects.toThrow();
      await expect(enqueueMonitorLaunch(review.command, f.ownerContext, f.db)).rejects.toThrow();
      await expect(
        enqueueMonitorLaunch(
          review.command,
          f.writerContext,
          f.db,
          () => new Date(Date.parse(review.expiresAt) + 1),
        ),
      ).rejects.toThrow();
      expect(transport.counts()).toEqual({ posts: 9, gets: 7 });
      expect(await f.db.localMonitorRetrySelection.count()).toBe(0);
      await f.db.keyword.update({
        where: { id: f.keyword.id },
        data: { text: "Changed original source" },
      });
      await expect(enqueueMonitorLaunch(review.command, f.writerContext, f.db)).rejects.toThrow();
      await f.db.membership.deleteMany({ where: { projectId: f.project.id, userId: f.writer.id } });
      await expect(
        readMonitorRetryOptions(
          {
            projectId: f.project.publicId,
            monitorId: f.monitor.monitorId,
            runId: f.parent.publicId,
          },
          f.writerContext,
          f.db,
        ),
      ).rejects.toThrow();
      expect(transport.counts()).toEqual({ posts: 9, gets: 7 });
    } finally {
      await f.close();
    }
  });
  it("canonical settled no-send remains retryable with original zero receipt and paid_attempts1", async () => {
    const transport = retryTransport(false),
      f = await retryDatabase(true);
    try {
      expect(transport.counts()).toEqual({ posts: 0, gets: 0 });
      const options = await readMonitorRetryOptions(
        { projectId: f.project.publicId, monitorId: f.monitor.monitorId, runId: f.parent.publicId },
        f.writerContext,
        f.db,
      );
      expect(options.rows).toHaveLength(9);
      expect(
        options.rows.every(
          (row) =>
            row.eligible && row.reason === "eligible_unsent" && row.financialState === "settled",
        ),
      ).toBe(true);
      const selected = options.rows[8];
      const review = await previewMonitorLaunch(
        {
          ...f.input,
          idempotencyKey: randomUUID(),
          retry: { parentRunId: f.parent.publicId, targetIds: [selected.targetId] },
        },
        f.writerContext,
        resolveManualLocalDriver,
        f.db,
      );
      if (review.kind !== "ready") throw new Error("Fresh unsent retry refused.");
      const queued = await enqueueMonitorLaunch(review.command, f.writerContext, f.db);
      const job = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
        where: { publicId: queued.intent.id },
      });
      expect(await executeMonitorJob(job.id, f.db)).toMatchObject({ state: "complete" });
      expect(transport.counts()).toEqual({ posts: 1, gets: 1 });
      const originalItems = await f.db.localMeasurementRunItem.findMany({
        where: { runId: f.parent.id },
      });
      const operations = await f.db.meteringOperation.findMany({
        where: {
          operation_id: {
            in: originalItems.flatMap((i) => (i.preparedAttemptId ? [i.preparedAttemptId] : [])),
          },
        },
      });
      expect(operations).toHaveLength(9);
      expect(operations.every((o) => o.state === "settled")).toBe(true);
      const proof = await f.client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM metering_command c JOIN metering_operation o USING(operation_pk) WHERE o.operation_id=ANY($1::text[]) AND c.command_id='paid:no-send' AND c.result->>'outcome'='settled'`,
        [originalItems.map((i) => i.preparedAttemptId)],
      );
      expect(proof.rows[0].count).toBe("9");
    } finally {
      await f.close();
    }
  });
});
