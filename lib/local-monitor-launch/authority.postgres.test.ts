import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { monitorDatabase } from "@/lib/local-monitor-store/postgres.test-fixture";
import { createLocalMonitor } from "@/lib/local-monitor-store/write";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { describe, expect, it, vi } from "vitest";
import type { ManualLocalDriverFactory } from "./driver";
import { previewMonitorLaunch } from "./preview";
import { readMonitorLaunchState } from "./read";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("manual monitor authority with the actual full migrated schema", () => {
  it("denies a viewer before resolving any driver and keeps read free of work", async () => {
    const f = await monitorDatabase();
    try {
      const created = await createLocalMonitor(f.command, f.writerContext, {
        db: f.db,
      });
      const connection = await f.db.providerConnection.create({
        data: {
          publicId: makePublicId("conn"),
          projectId: f.project.id,
          kind: "serp",
          provider: "dataforseo",
          enabled: true,
          status: "connected",
          credentialSource: "own",
          credentialsEncrypted: "synthetic-not-a-provider-secret",
        },
      });
      const factory: ManualLocalDriverFactory = vi.fn(async () => ({
        kind: "unavailable" as const,
        reason: "unsupported" as const,
      }));
      const input = {
        projectId: f.project.publicId,
        monitorId: created.receipt.monitorId,
        expectedVersion: 1,
        connectionId: connection.publicId,
        idempotencyKey: randomUUID(),
      };
      await expect(previewMonitorLaunch(input, f.ownerContext, factory, f.db)).rejects.toThrow();
      expect(factory).not.toHaveBeenCalled();
      expect(
        (
          await readMonitorLaunchState(
            { projectId: input.projectId, monitorId: input.monitorId },
            f.ownerContext,
            f.db,
          )
        ).run,
      ).toBeNull();
      expect(await f.db.localMeasurementTarget.count()).toBe(0);
      expect(await f.db.localMeasurementRun.count()).toBe(0);
      await f.db.membership.deleteMany({
        where: { projectId: f.project.id, userId: f.owner.id },
      });
      await expect(
        readMonitorLaunchState(
          { projectId: input.projectId, monitorId: input.monitorId },
          f.ownerContext,
          f.db,
        ),
      ).rejects.toThrow();
    } finally {
      await f.close();
    }
  }, 120_000);
  it("returns unsupported before target materialization, reservation or schedule changes", async () => {
    const f = await monitorDatabase();
    try {
      const created = await createLocalMonitor(f.command, f.writerContext, {
        db: f.db,
      });
      const connection = await f.db.providerConnection.create({
        data: {
          publicId: makePublicId("conn"),
          projectId: f.project.id,
          kind: "serp",
          provider: "dataforseo",
          enabled: true,
          status: "connected",
          credentialSource: "own",
          credentialsEncrypted: "synthetic-not-a-provider-secret",
        },
      });
      const factory: ManualLocalDriverFactory = vi.fn(async () => ({
        kind: "unavailable" as const,
        reason: "unsupported" as const,
      }));
      const schedules = await f.db.checkSchedule.count();
      expect(
        await previewMonitorLaunch(
          {
            projectId: f.project.publicId,
            monitorId: created.receipt.monitorId,
            expectedVersion: 1,
            connectionId: connection.publicId,
            idempotencyKey: randomUUID(),
          },
          f.writerContext,
          factory,
          f.db,
        ),
      ).toEqual({ kind: "unavailable", reason: "unsupported" });
      expect(factory).toHaveBeenCalledTimes(1);
      expect(await f.db.localMeasurementTarget.count()).toBe(0);
      expect(await f.db.localMeasurementRun.count()).toBe(0);
      expect(await f.db.checkSchedule.count()).toBe(schedules);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rolls occurrence and its run back together if admission fails; history cannot be rewritten", async () => {
    const f = await monitorDatabase();
    try {
      const created = await createLocalMonitor(f.command, f.writerContext, {
        db: f.db,
      });
      const head = await f.db.localMonitor.findFirstOrThrow({
        where: { projectId: f.project.id, publicId: created.receipt.monitorId },
      });
      if (!head.currentRevisionId || !head.currentScheduleIntentId)
        throw new Error("Missing persisted monitor heads");
      const runId = randomUUID(),
        occurrenceId = randomUUID(),
        hash = "a".repeat(64);
      // Synthetic pre-admission envelopes test only SQL lifecycle. No provider/Meter success is claimed.
      const insert = async (tx: LocalTransaction, quoteHash = `local-quote-v1:${hash}`) => {
        await tx.localMeasurementRun.create({
          data: {
            id: runId,
            publicId: makePublicId("lmr"),
            projectId: f.project.id,
            operation: "local_scan_submit",
            keyHash: hash,
            bodyHash: hash,
            actorId: f.writer.id,
            quote: {},
            quoteHash,
            expectedTargetKeys: ["synthetic-schema-envelope"],
            source: "app",
            trigger: "manual",
          },
        });
        await tx.$executeRaw`INSERT INTO public.local_monitor_occurrences(id,"projectId","monitorId","definitionRevisionId","scheduleIntentId","monitorVersion","actorId",mode,"keyHash","bodyHash","quoteHash","runId") VALUES (${occurrenceId},${f.project.id},${head.id},${head.currentRevisionId},${head.currentScheduleIntentId},${head.version},${f.writer.id},'manual',${hash},${hash},${quoteHash},${runId})`;
      };
      // A different quote namespace is not authority, even if run and occurrence agree.
      await expect(f.db.$transaction((tx) => insert(tx, `local-quote-v2:${hash}`))).rejects.toThrow(
        "local_monitor_occurrences_quoteHash_check",
      );
      expect(await f.db.localMeasurementRun.count({ where: { id: runId } })).toBe(0);
      await expect(
        f.db.$transaction(async (tx) => {
          await insert(tx);
          throw new Error("admission-refused");
        }),
      ).rejects.toThrow("admission-refused");
      expect(await f.db.localMeasurementRun.count({ where: { id: runId } })).toBe(0);
      expect(
        (
          await f.client.query("SELECT id FROM public.local_monitor_occurrences WHERE id=$1", [
            occurrenceId,
          ])
        ).rows,
      ).toHaveLength(0);
      await f.db.$transaction(insert);
      await expect(
        f.client.query('UPDATE public.local_monitor_occurrences SET "bodyHash"=$1 WHERE id=$2', [
          "b".repeat(64),
          occurrenceId,
        ]),
      ).rejects.toThrow("immutable");
      await expect(
        f.client.query("DELETE FROM public.local_monitor_occurrences WHERE id=$1", [occurrenceId]),
      ).rejects.toThrow();
    } finally {
      await f.close();
    }
  }, 120_000);
});
