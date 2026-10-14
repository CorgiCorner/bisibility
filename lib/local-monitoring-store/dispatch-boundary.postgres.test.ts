import { Prisma } from "@/lib/generated/prisma/client";
import { applySubmissionEvent } from "@/lib/local-monitoring/submission-state";
import { readLocalHostRun } from "@/lib/local-monitoring-host/read";
import { describe, expect, it } from "vitest";
import { cancelLocalMeasurementRun, releaseCancelledUnsentLocalItem } from "./cancel-run";
import { localOperationStore } from "./operation-store";
import { type LocalPgFixture, localMeasurementDatabase } from "./postgres.test-fixture";
import { prepareLocalMeasurementRun } from "./prepare-run";
import { submissionRecordSchema } from "./schema";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
async function admitted(f: LocalPgFixture) {
  const target = await f.target();
  const prepared = await prepareLocalMeasurementRun(
    f.launch([target]),
    f.writerContext,
    f.ports,
    f.db,
  );
  const run = await f.db.localMeasurementRun.findUniqueOrThrow({
    where: { publicId: prepared.id },
  });
  const item = await f.db.localMeasurementRunItem.findFirstOrThrow({ where: { runId: run.id } });
  return {
    prepared,
    item,
    run,
    ref: { projectId: f.project.publicId, runId: prepared.id, targetId: target.id },
  };
}
async function nativeFence(f: LocalPgFixture, id: string | null) {
  const result = await f.client.query(
    "SELECT fenced_at FROM metering_paid_attempt_context WHERE operation_id=$1",
    [id],
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0].fenced_at;
}
suite("joined Local native first-send boundary (full schema)", () => {
  it("leaves rejected current activation unfenced, claimed and safely cancellable", async () => {
    const f = await localMeasurementDatabase();
    try {
      const { prepared, item, ref } = await admitted(f);
      f.ports.activation.assertPreparedTaskset = async () => {
        throw new Error("Synthetic activation denied");
      };
      await expect(prepared.submitters[0].submit()).rejects.toThrow("activation denied");
      const row = await f.db.localMeasurementRunItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.record).toMatchObject({ status: "claimed", attemptId: null, version: 0 });
      expect(await nativeFence(f, item.preparedAttemptId)).toBeNull();
      await cancelLocalMeasurementRun(
        { projectId: ref.projectId, runId: ref.runId, expectedVersion: 0 },
        f.writerContext,
        f.db,
      );
      await releaseCancelledUnsentLocalItem(ref, f.writerContext, f.db);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      expect(f.counters.submissions).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rolls back the real native fence when the joined projection fails", async () => {
    const f = await localMeasurementDatabase();
    try {
      const { prepared, item } = await admitted(f);
      await f.client.query(`CREATE FUNCTION reject_fixture_send_projection() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.record->>'status'='unknown_acceptance' THEN
            IF NOT EXISTS (SELECT 1 FROM metering_paid_attempt_context WHERE operation_id=NEW."preparedAttemptId" AND fenced_at IS NOT NULL) THEN
              RAISE EXCEPTION 'Synthetic projection preceded native fence';
            END IF;
            RAISE EXCEPTION 'Synthetic projection failed after canonical fence';
          END IF;
          RETURN NEW;
        END; $$;
        CREATE TRIGGER fixture_projection_failure BEFORE UPDATE ON local_measurement_run_items FOR EACH ROW EXECUTE FUNCTION reject_fixture_send_projection();`);
      await expect(prepared.submitters[0].submit()).rejects.toThrow("failed after canonical fence");
      expect(await nativeFence(f, item.preparedAttemptId)).toBeNull();
      expect(
        (await f.db.localMeasurementRunItem.findUniqueOrThrow({ where: { id: item.id } })).record,
      ).toMatchObject({ status: "claimed", attemptId: null, version: 0 });
      expect(f.counters.submissions).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("commits the exact native fence and projection before the only submit", async () => {
    const f = await localMeasurementDatabase();
    try {
      const { prepared, item } = await admitted(f);
      const original = f.ports.adapter.submit;
      f.ports.adapter.submit = async (request) => {
        expect(await nativeFence(f, item.preparedAttemptId)).not.toBeNull();
        expect(
          (await f.db.localMeasurementRunItem.findUniqueOrThrow({ where: { id: item.id } })).record,
        ).toMatchObject({
          status: "unknown_acceptance",
          attemptId: item.preparedAttemptId,
          outcome: null,
        });
        return original(request);
      };
      expect((await prepared.submitters[0].submit()).status).toBe("accepted");
      await expect(prepared.submitters[0].submit()).rejects.toThrow("already consumed");
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("refuses possible-send through plain workflow CAS even for the correct attempt", async () => {
    const f = await localMeasurementDatabase();
    try {
      const { item, run } = await admitted(f);
      await expect(
        localOperationStore(f.db, f.project.id, run.id).apply(item.operationKey, 0, {
          kind: "possible_send",
          attemptId: item.preparedAttemptId!,
        }),
      ).rejects.toThrow("joined first-dispatch");
      expect(await nativeFence(f, item.preparedAttemptId)).toBeNull();
    } finally {
      await f.close();
    }
  }, 120_000);
  it("recovers an old unfenced marker and retains its attempt after native release", async () => {
    const f = await localMeasurementDatabase();
    try {
      const { item, prepared, ref } = await admitted(f);
      const legacy = applySubmissionEvent(submissionRecordSchema.parse(item.record), {
        kind: "possible_send",
        attemptId: item.preparedAttemptId!,
      });
      await f.db.localMeasurementRunItem.update({
        where: { id: item.id },
        data: { record: legacy as Prisma.InputJsonValue, version: legacy.version },
      });
      await cancelLocalMeasurementRun(
        { projectId: ref.projectId, runId: ref.runId, expectedVersion: 0 },
        f.writerContext,
        f.db,
      );
      await expect(releaseCancelledUnsentLocalItem(ref, f.writerContext, f.db)).rejects.toThrow();
      expect(f.counters.submissions).toBe(0);
      await f.db.localMeasurementTargetOwner.updateMany({
        where: { itemId: item.id },
        data: { workerExpiresAt: new Date(0) },
      });
      const member = await f.db.membership.findFirstOrThrow({
        where: { projectId: f.project.id, userId: f.writer.id },
      });
      await f.db.membership.delete({ where: { id: member.id } });
      await expect(releaseCancelledUnsentLocalItem(ref, f.writerContext, f.db)).rejects.toThrow();
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      await f.db.membership.create({ data: member });
      await releaseCancelledUnsentLocalItem(ref, f.writerContext, f.db);
      const row = await f.db.localMeasurementRunItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.record).toMatchObject({
        status: "cancelled",
        attemptId: item.preparedAttemptId,
        outcome: null,
      });
      const read = await readLocalHostRun(
        { projectId: ref.projectId, runId: ref.runId },
        f.writerContext,
        f.db,
      );
      expect(read.items[0]).toMatchObject({
        financialState: "settled",
        ownerRetained: false,
        status: "cancelled",
        accountingPending: false,
        resolution: "cancelled",
      });
      const changed = await f.client.query(
        `UPDATE metering_command c SET kind='fixture-untrusted'
        FROM metering_operation o WHERE c.operation_pk=o.operation_pk
        AND o.operation_id=$1 AND c.command_id='paid:no-send'`,
        [item.preparedAttemptId],
      );
      expect(changed.rowCount).toBe(1);
      await expect(
        readLocalHostRun({ projectId: ref.projectId, runId: ref.runId }, f.writerContext, f.db),
      ).rejects.toThrow();
      await expect(f.db.project.delete({ where: { id: f.project.id } })).rejects.toThrow();
      await f.client.query(
        `UPDATE metering_command c SET kind='settle'
        FROM metering_operation o WHERE c.operation_pk=o.operation_pk
        AND o.operation_id=$1 AND c.command_id='paid:no-send'`,
        [item.preparedAttemptId],
      );
      await expect(prepared.submitters[0].submit()).rejects.toThrow("Fresh admitted");
      expect(f.counters.submissions).toBe(0);
      await f.db.project.delete({ where: { id: f.project.id } });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("keeps a genuinely fenced lost response after expiry and cancellation", async () => {
    const f = await localMeasurementDatabase();
    try {
      const { item, prepared, ref } = await admitted(f);
      f.ports.adapter.submit = async () => {
        f.counters.submissions += 1;
        throw new Error("Synthetic response loss");
      };
      await prepared.submitters[0].submit();
      await f.db.localMeasurementTargetOwner.updateMany({
        where: { itemId: item.id },
        data: { workerToken: "fixture-expired-original", workerExpiresAt: new Date(0) },
      });
      await cancelLocalMeasurementRun(
        { projectId: ref.projectId, runId: ref.runId, expectedVersion: 0 },
        f.writerContext,
        f.db,
      );
      await expect(releaseCancelledUnsentLocalItem(ref, f.writerContext, f.db)).rejects.toThrow();
      expect(await nativeFence(f, item.preparedAttemptId)).not.toBeNull();
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
});
