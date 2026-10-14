import { describe, expect, it } from "vitest";
import { cancelLocalMeasurementRun, releaseCancelledUnsentLocalItem } from "./cancel-run";
import { collectLocalMeasurementItem } from "./collect-item";
import { claimLocalContinuation } from "./continuation-lease";
import { localOperationStore } from "./operation-store";
import { type LocalPgFixture, localMeasurementDatabase } from "./postgres.test-fixture";
import { prepareLocalMeasurementRun } from "./prepare-run";
import { reconcileLocalMeasurementItem } from "./recovery";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
function reference(f: LocalPgFixture, runId: string, targetId: string) {
  return { projectId: f.project.publicId, runId, targetId };
}
async function lease(
  f: LocalPgFixture,
  runId: string,
  targetId: string,
  purpose: "collect" | "reconcile",
  ttlMs = 60_000,
) {
  const target = await f.db.localMeasurementTarget.findUniqueOrThrow({
    where: { publicId: targetId },
  });
  const owner = await f.db.localMeasurementTargetOwner.findFirstOrThrow({
    where: { projectId: f.project.id, targetId: target.id },
  });
  return claimLocalContinuation(
    { ...reference(f, runId, targetId), expectedVersion: owner.version, purpose },
    f.writerContext,
    { ttlMs, clock: f.clock },
    f.db,
  );
}
suite("local monitoring durable acceptance and cancellation (full schema)", () => {
  it("consumes the only send permit and blocks fresh-key rebuy after unknown acceptance", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      f.ports.adapter.submit = async () => {
        f.counters.submissions += 1;
        throw new Error("Synthetic ambiguous transport.");
      };
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      expect((await prepared.submitters[0].submit()).status).toBe("unknown_acceptance");
      await expect(prepared.submitters[0].submit()).rejects.toThrow("already consumed");
      f.advance(61_000);
      await expect(
        prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "LocalTargetBlocked" });
      expect(f.counters.submissions).toBe(1);
      expect(await f.db.meteringUsageEvidence.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("cannot regenerate a send grant after a process loses its admitted claimed work", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const data = f.launch([target]);
      await prepareLocalMeasurementRun(data, f.writerContext, f.ports, f.db);
      const restarted = await prepareLocalMeasurementRun(data, f.writerContext, f.ports, f.db);
      expect(restarted.submitters).toEqual([]);
      await expect(
        prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "LocalTargetBlocked" });
      expect(f.counters.submissions).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("retains accepted IDs through cancellation and collects after quote/cache expiry without RankCheck", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      const accepted = await prepared.submitters[0].submit();
      expect(accepted.outcome?.taskIds).toEqual(["synthetic-task"]);
      await cancelLocalMeasurementRun(
        { projectId: f.project.publicId, runId: prepared.id, expectedVersion: 0 },
        f.writerContext,
        f.db,
      );
      f.advance(180_000);
      const current = await lease(f, prepared.id, target.id, "collect");
      await collectLocalMeasurementItem(
        reference(f, prepared.id, target.id),
        f.writerContext,
        current,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      const observation = await f.db.observationRun.findFirstOrThrow({
        where: { projectId: f.project.id },
      });
      expect(observation.rankCheckId).toBeNull();
      expect(observation.neutralExecutionItemId).not.toBeNull();
      expect(await f.db.rankCheck.count()).toBe(0);
      const item = await f.db.observationItem.findFirstOrThrow({
        where: { observationRunId: observation.id },
      });
      expect(item.cid).toBe("18446744073709551615");
      expect(item.observedAt?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
      const replay = await collectLocalMeasurementItem(
        reference(f, prepared.id, target.id),
        f.writerContext,
        current,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      expect(replay.replayed).toBe(true);
      expect(f.counters.submissions).toBe(1);
      expect(f.counters.collections).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("keeps absent original timestamps unknown instead of deriving current capture time", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      await prepared.submitters[0].submit();
      f.ports.adapter.collect = async (taskIds) => ({
        taskIds,
        observedAt: null,
        payload: {},
        completeness: "unknown",
        completeThrough: null,
      });
      const current = await lease(f, prepared.id, target.id, "collect");
      await collectLocalMeasurementItem(
        reference(f, prepared.id, target.id),
        f.writerContext,
        current,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      expect((await f.db.observationItem.findFirstOrThrow()).observedAt).toBeNull();
      expect((await f.db.observationRun.findFirstOrThrow()).requestPolicy).toMatchObject({
        evidence: { observedAt: null },
      });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("collects known accepted subset while retaining the unknown target gate", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const submit = f.ports.adapter.submit;
      f.ports.adapter.submit = async (request) => ({
        ...(await submit(request)),
        acceptance: "unknown",
      });
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      await prepared.submitters[0].submit();
      const current = await lease(f, prepared.id, target.id, "collect");
      await collectLocalMeasurementItem(
        reference(f, prepared.id, target.id),
        f.writerContext,
        current,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      expect((await f.db.observationRun.findFirstOrThrow()).completeness).toBe("unknown");
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      await expect(
        prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "LocalTargetBlocked" });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("permits continuation takeover after expiry but rejects the old token and never repurchases", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      f.ports.adapter.submit = async () => ({
        acceptance: "unknown",
        taskIds: [],
        receivedAt: f.clock().toISOString(),
        usage: { cached: false, costCents: null, quantity: null, failed: true },
      });
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      await prepared.submitters[0].submit();
      await cancelLocalMeasurementRun(
        { projectId: f.project.publicId, runId: prepared.id, expectedVersion: 0 },
        f.writerContext,
        f.db,
      );
      const old = await lease(f, prepared.id, target.id, "reconcile", 10);
      f.advance(20);
      const current = await lease(f, prepared.id, target.id, "reconcile");
      await expect(
        reconcileLocalMeasurementItem(
          reference(f, prepared.id, target.id),
          f.writerContext,
          old,
          f.clock,
          f.db,
        ),
      ).rejects.toMatchObject({ name: "LocalMeasurementConflictError" });
      expect(
        (
          await reconcileLocalMeasurementItem(
            reference(f, prepared.id, target.id),
            f.writerContext,
            current,
            f.clock,
            f.db,
          )
        ).status,
      ).toBe("needs_provider_evidence");
      expect(await f.db.meteringUsageEvidence.count()).toBe(1);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("records a real first zero rejection and releases ownership only after canonical settlement", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      f.ports.adapter.submit = async () => ({
        acceptance: "rejected",
        taskIds: [],
        receivedAt: f.clock().toISOString(),
        usage: { cached: false, costCents: 0, quantity: 0, failed: true },
      });
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      expect((await prepared.submitters[0].submit()).status).toBe("rejected");
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      expect((await f.db.meteringUsageEvidence.findFirstOrThrow()).measurementStatus).toBe(
        "recorded",
      );
    } finally {
      await f.close();
    }
  }, 120_000);
  it("uses canonical native-ID dedupe rather than a local duplicate cost ledger", async () => {
    const f = await localMeasurementDatabase();
    try {
      const targets = [await f.target(), await f.target("22")];
      const prepared = await prepareLocalMeasurementRun(
        f.launch(targets),
        f.writerContext,
        f.ports,
        f.db,
      );
      await prepared.submitters[0].submit();
      await prepared.submitters[1].submit();
      const evidence = await f.db.meteringUsageEvidence.findMany({ orderBy: { createdAt: "asc" } });
      expect(evidence).toHaveLength(2);
      expect(evidence.filter(({ canonicalId }) => canonicalId !== null)).toHaveLength(1);
      expect(evidence.find(({ canonicalId }) => canonicalId !== null)?.receipt).toMatchObject({
        costCents: "0",
        quantity: "0",
      });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("cannot mark settlement or attach unrelated evidence through plain workflow CAS", async () => {
    const f = await localMeasurementDatabase();
    try {
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
      const item = await f.db.localMeasurementRunItem.findFirstOrThrow();
      if (!item.preparedAttemptId) throw new Error("Prepared custody was not written.");
      const store = localOperationStore(f.db, f.project.id, run.id);
      await expect(
        store.apply(item.operationKey, 0, {
          kind: "settlement",
          attemptId: item.preparedAttemptId,
        }),
      ).rejects.toThrow("joined canonical");
      await expect(
        store.apply(item.operationKey, 0, {
          kind: "possible_send",
          attemptId: "unrelated-attempt",
        }),
      ).rejects.toThrow("original prepared attempt");
    } finally {
      await f.close();
    }
  }, 120_000);
  it("cancels only canonically proven unsent work and fences the original sender", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      await cancelLocalMeasurementRun(
        { projectId: f.project.publicId, runId: prepared.id, expectedVersion: 0 },
        f.writerContext,
        f.db,
      );
      await releaseCancelledUnsentLocalItem(
        reference(f, prepared.id, target.id),
        f.writerContext,
        f.db,
      );
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      await expect(prepared.submitters[0].submit()).rejects.toThrow("Fresh admitted");
      expect(f.counters.submissions).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
});
