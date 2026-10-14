import { makePublicId } from "@/lib/db/public-id-resources";
import type {
  SubmissionOutcome,
  SubmissionReconciliation,
} from "@/lib/local-monitoring/execution-types";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { ownTransportRef } from "@/lib/metering/transport-own-admission";
import { describe, expect, it } from "vitest";
import type { LocalAcceptanceProofPort, OriginalLocalProofBinding } from "./acceptance-proof";
import { localCanonicalFinancialState } from "./acceptance-proof";
import { cancelLocalMeasurementRun } from "./cancel-run";
import { collectLocalMeasurementItem } from "./collect-item";
import { claimLocalContinuation } from "./continuation-lease";
import { neutralLocalEvidencePort } from "./evidence-persistence";
import { localOperationStore } from "./operation-store";
import { type LocalPgFixture, localMeasurementDatabase } from "./postgres.test-fixture";
import { prepareLocalMeasurementRun } from "./prepare-run";
import { reconcileLocalMeasurementItem } from "./recovery";
import { submissionRecordSchema } from "./schema";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
function proof(
  binding: OriginalLocalProofBinding,
  outcome: SubmissionOutcome,
  verifiedAt: string,
): SubmissionReconciliation {
  return {
    version: 1,
    kind: "provider_receipt",
    proofId: "fixture-original-submit-receipt",
    attemptId: binding.attemptId,
    projectId: binding.projectId,
    operationKey: binding.operationKey,
    targetKey: binding.targetKey,
    provider: binding.provider,
    adapterVersion: binding.adapterVersion,
    device: binding.device,
    verifiedAt,
    exhaustive: true,
    outcome,
  };
}
async function ambiguous(f: LocalPgFixture, mode: "lost" | "subset" | "unknown_money" = "lost") {
  const target = await f.target();
  const submit = f.ports.adapter.submit;
  const captured: SubmissionOutcome[] = [];
  f.ports.adapter.submit = async (request) => {
    const original = await submit(request);
    captured.push(original);
    if (mode === "lost") throw new Error("Synthetic accepted response lost.");
    return {
      ...original,
      acceptance: "unknown",
      usage: mode === "unknown_money" ? { ...original.usage, costCents: null } : original.usage,
    };
  };
  const prepared = await prepareLocalMeasurementRun(
    f.launch([target]),
    f.writerContext,
    f.ports,
    f.db,
  );
  await prepared.submitters[0].submit();
  const item = await f.db.localMeasurementRunItem.findFirstOrThrow();
  const reference = { projectId: f.project.publicId, runId: prepared.id, targetId: target.id };
  const port: LocalAcceptanceProofPort = {
    async loadVerifiedOriginalProof(binding) {
      const original = captured[0];
      if (!original) throw new Error("Synthetic provider did not retain a receipt.");
      return proof(binding, original, f.clock().toISOString());
    },
  };
  async function lease(purpose: "collect" | "reconcile") {
    const owner = await f.db.localMeasurementTargetOwner.findFirstOrThrow({
      where: { itemId: item.id },
    });
    return claimLocalContinuation(
      { ...reference, expectedVersion: owner.version, purpose },
      f.writerContext,
      { ttlMs: 60_000, clock: f.clock },
      f.db,
    );
  }
  async function record() {
    return submissionRecordSchema.parse(
      (await f.db.localMeasurementRunItem.findUniqueOrThrow({ where: { id: item.id } })).record,
    );
  }
  return { target, prepared, item, reference, port, lease, record, captured };
}

suite("later original acceptance proof (full schema and canonical Meter)", () => {
  it("resolves original lost response, preserves cancellation and never grants a second POST", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f);
      const before = await a.record();
      if (!before.attemptId) throw new Error("Original fixture attempt missing.");
      const attemptId = before.attemptId;
      const originalFinancial = await f.db.$transaction(async (tx) =>
        readPaidOperation(await createTransactionMeter(tx), await ownTransportRef(tx, attemptId)),
      );
      expect(originalFinancial.receipts.length).toBeGreaterThan(0);
      await cancelLocalMeasurementRun(
        { projectId: f.project.publicId, runId: a.prepared.id, expectedVersion: 0 },
        f.writerContext,
        f.db,
      );
      f.advance(180_000);
      const current = await a.lease("reconcile");
      const result = await reconcileLocalMeasurementItem(
        a.reference,
        f.writerContext,
        current,
        f.clock,
        f.db,
        a.port,
      );
      expect(result).toMatchObject({
        status: "recorded",
        acceptance: "accepted",
        financialState: "settled",
      });
      expect(await a.record()).toMatchObject({
        cancellationRequested: true,
        attemptId: before.attemptId,
        originalOutcome: before.outcome,
        settlementRecorded: true,
      });
      const refinedFinancial = await f.db.$transaction(async (tx) =>
        readPaidOperation(await createTransactionMeter(tx), await ownTransportRef(tx, attemptId)),
      );
      for (const old of originalFinancial.receipts)
        expect(refinedFinancial.receipts.find(({ id }) => id === old.id)).toEqual(old);
      expect(refinedFinancial.receipts.length).toBeGreaterThan(originalFinancial.receipts.length);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1); // Tasks still need collection.
      const collect = await a.lease("collect");
      await collectLocalMeasurementItem(
        a.reference,
        f.writerContext,
        collect,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      const final = await a.record();
      const native = await f.db.meteringUsageEvidence.findFirstOrThrow();
      await reconcileLocalMeasurementItem(
        a.reference,
        f.writerContext,
        current,
        f.clock,
        f.db,
        a.port,
      );
      expect(await a.record()).toEqual(final);
      expect((await f.db.meteringUsageEvidence.findFirstOrThrow()).proofVersion).toBe(
        native.proofVersion,
      );
      await expect(a.prepared.submitters[0].submit()).rejects.toThrow("already consumed");
      expect(f.counters.submissions).toBe(1);
      expect(f.counters.collections).toBe(1);
      expect(await f.db.rankCheck.count()).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("keeps accepted and collected work gated while original native money remains unknown", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f, "unknown_money");
      const current = await a.lease("reconcile");
      const unknown: LocalAcceptanceProofPort = {
        async loadVerifiedOriginalProof(binding) {
          return {
            ...proof(
              binding,
              { ...a.captured[0], usage: { ...a.captured[0].usage, costCents: null } },
              f.clock().toISOString(),
            ),
            proofId: "fixture-original-acceptance-only",
          };
        },
      };
      expect(
        await reconcileLocalMeasurementItem(
          a.reference,
          f.writerContext,
          current,
          f.clock,
          f.db,
          unknown,
        ),
      ).toMatchObject({
        status: "accounting_pending",
        acceptance: "accepted",
        financialState: "pending",
      });
      f.advance(61_000);
      const collect = await a.lease("collect");
      await collectLocalMeasurementItem(
        a.reference,
        f.writerContext,
        collect,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      await expect(
        prepareLocalMeasurementRun(f.launch([a.target]), f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "LocalTargetBlocked" });
      f.advance(61_000);
      const refine = await a.lease("reconcile");
      expect(
        await reconcileLocalMeasurementItem(
          a.reference,
          f.writerContext,
          refine,
          f.clock,
          f.db,
          a.port,
        ),
      ).toMatchObject({ status: "recorded", financialState: "settled" });
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("refines a collected same-set receipt without rewriting normalized history or completeness", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f, "unknown_money");
      const collect = await a.lease("collect");
      await collectLocalMeasurementItem(
        a.reference,
        f.writerContext,
        collect,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      const observation = await f.db.observationRun.findFirstOrThrow();
      const items = await f.db.observationItem.findMany();
      expect(observation.completeness).toBe("unknown");
      f.advance(61_000);
      const reconcile = await a.lease("reconcile");
      await reconcileLocalMeasurementItem(
        a.reference,
        f.writerContext,
        reconcile,
        f.clock,
        f.db,
        a.port,
      );
      expect(await f.db.observationRun.findFirstOrThrow()).toEqual(observation);
      expect(await f.db.observationItem.findMany()).toEqual(items);
      expect(await a.record()).toMatchObject({
        status: "accepted",
        collectedEvidenceId: observation.id,
        pendingReconciliationReason: null,
      });
      const evidence = neutralLocalEvidencePort(
        f.db,
        collect,
        {
          async normalize(value) {
            return { ...(await f.normalizer.normalize(value)), executedAt: observation.executedAt };
          },
        },
        f.clock,
      );
      await expect(
        evidence.persist({
          record: await a.record(),
          result: {
            taskIds: a.captured[0].taskIds,
            observedAt: "2026-10-01T10:00:00.000Z",
            payload: { synthetic: true },
            completeness: "complete",
            completeThrough: 10,
          },
        }),
      ).rejects.toThrow("immutable projection");
      expect(await f.db.observationRun.findFirstOrThrow()).toEqual(observation);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      expect(f.counters.collections).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("retains extra late IDs as pending, original collected subset immutable and owner still blocked", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f, "subset");
      const collect = await a.lease("collect");
      await collectLocalMeasurementItem(
        a.reference,
        f.writerContext,
        collect,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      const observation = await f.db.observationRun.findFirstOrThrow();
      const items = await f.db.observationItem.findMany();
      const before = await a.record();
      f.advance(61_000);
      const current = await a.lease("reconcile");
      const expanded: LocalAcceptanceProofPort = {
        async loadVerifiedOriginalProof(binding) {
          return proof(
            binding,
            { ...a.captured[0], taskIds: ["synthetic-task", "additional-original-task"] },
            f.clock().toISOString(),
          );
        },
      };
      expect(
        await reconcileLocalMeasurementItem(
          a.reference,
          f.writerContext,
          current,
          f.clock,
          f.db,
          expanded,
        ),
      ).toMatchObject({
        status: "pending_reconciliation",
        reason: "collected_scope_conflict",
        financialState: "settled",
      });
      const after = await a.record();
      expect(after.outcome).toEqual(before.outcome);
      expect(after.reconciliationHistory?.[0].outcome.taskIds).toHaveLength(2);
      expect(await f.db.observationRun.findFirstOrThrow()).toEqual(observation);
      expect(await f.db.observationItem.findMany()).toEqual(items);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      await expect(
        prepareLocalMeasurementRun(f.launch([a.target]), f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "LocalTargetBlocked" });
      expect(f.counters.submissions).toBe(1);
      expect(f.counters.collections).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rechecks current membership after proof read and persists neither proof nor charge after revocation", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f);
      const current = await a.lease("reconcile");
      const before = await a.record();
      const revoked: LocalAcceptanceProofPort = {
        async loadVerifiedOriginalProof(binding) {
          const value = await a.port.loadVerifiedOriginalProof(binding);
          await f.db.membership.deleteMany({
            where: { projectId: f.project.id, userId: f.writer.id },
          });
          return value;
        },
      };
      await expect(
        reconcileLocalMeasurementItem(
          a.reference,
          f.writerContext,
          current,
          f.clock,
          f.db,
          revoked,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(await a.record()).toEqual(before);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rejects another execution device and a current unconfigured keyword device", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f);
      const current = await a.lease("reconcile");
      const before = await a.record();
      const wrong: LocalAcceptanceProofPort = {
        async loadVerifiedOriginalProof(binding) {
          return { ...(await a.port.loadVerifiedOriginalProof(binding)), device: "mobile" };
        },
      };
      await expect(
        reconcileLocalMeasurementItem(a.reference, f.writerContext, current, f.clock, f.db, wrong),
      ).rejects.toThrow("another execution device");
      await f.db.keyword.update({ where: { id: f.keyword.id }, data: { device: "mobile" } });
      await expect(
        reconcileLocalMeasurementItem(a.reference, f.writerContext, current, f.clock, f.db, a.port),
      ).rejects.toMatchObject({ name: "LocalDeviceNotConfiguredError" });
      expect(await a.record()).toEqual(before);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("refuses cross-project references before the trusted provider proof port is read", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f);
      const current = await a.lease("reconcile");
      const before = await a.record();
      const foreign = await f.db.project.create({
        data: {
          publicId: makePublicId("prj"),
          name: "Other synthetic",
          domain: "other.test",
          ownerId: f.writer.id,
        },
      });
      await f.db.membership.create({
        data: {
          publicId: makePublicId("mbr"),
          projectId: foreign.id,
          userId: f.writer.id,
          role: "owner",
        },
      });
      let reads = 0;
      const port: LocalAcceptanceProofPort = {
        async loadVerifiedOriginalProof(binding) {
          reads += 1;
          return a.port.loadVerifiedOriginalProof(binding);
        },
      };
      await expect(
        reconcileLocalMeasurementItem(
          { ...a.reference, projectId: foreign.publicId },
          f.writerContext,
          current,
          f.clock,
          f.db,
          port,
        ),
      ).rejects.toMatchObject({ name: "LocalMeasurementUnavailableError" });
      expect(reads).toBe(0);
      expect(await a.record()).toEqual(before);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rejects stale leases, held projects and viewer-supplied owner context", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f);
      const expired = await a.lease("reconcile");
      f.advance(61_000);
      await expect(
        reconcileLocalMeasurementItem(a.reference, f.writerContext, expired, f.clock, f.db, a.port),
      ).rejects.toMatchObject({ name: "LocalMeasurementConflictError" });
      const current = await a.lease("reconcile");
      await expect(
        reconcileLocalMeasurementItem(a.reference, f.ownerContext, current, f.clock, f.db, a.port),
      ).rejects.toMatchObject({ code: "forbidden" });
      await f.db.project.update({
        where: { id: f.project.id },
        data: { writeMode: "migration_hold" },
      });
      await expect(
        reconcileLocalMeasurementItem(a.reference, f.writerContext, current, f.clock, f.db, a.port),
      ).rejects.toMatchObject({ name: "ProjectReadOnlyError" });
      expect((await a.record()).reconciliationHistory).toEqual([]);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("does not accept public JSON proof or let generic workflow CAS reconcile provider facts", async () => {
    const f = await localMeasurementDatabase();
    try {
      const a = await ambiguous(f);
      const current = await a.lease("reconcile");
      const record = await a.record();
      const supplied = await a.port.loadVerifiedOriginalProof({
        ...a.item,
        attemptId: record.attemptId!,
        operationKey: record.key,
        targetKey: record.targetKey,
        adapterVersion: record.adapterVersion,
        device: "desktop",
      });
      await expect(
        reconcileLocalMeasurementItem(
          { ...a.reference, proof: supplied },
          f.writerContext,
          current,
          f.clock,
          f.db,
          a.port,
        ),
      ).rejects.toThrow();
      const store = localOperationStore(f.db, f.project.id, a.item.runId);
      await expect(
        store.apply(record.key, record.version, {
          kind: "reconciled",
          attemptId: supplied.attemptId,
          proof: supplied,
        }),
      ).rejects.toThrow("Trusted host proof verification");
      expect(await a.record()).toEqual(record);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("retains unknown native history then proves a real zero rejection through canonical correction", async () => {
    const f = await localMeasurementDatabase();
    try {
      f.ports.adapter.submit = async () => {
        f.counters.submissions += 1;
        return {
          acceptance: "rejected",
          taskIds: [],
          receivedAt: f.clock().toISOString(),
          usage: {
            cached: false,
            costCents: 0,
            quantity: 0,
            failed: true,
            providerRequestId: "synthetic-zero-rejected",
          },
        };
      };
      const a = await ambiguous(f);
      const current = await a.lease("reconcile");
      const before = await a.record();
      expect(
        await reconcileLocalMeasurementItem(
          a.reference,
          f.writerContext,
          current,
          f.clock,
          f.db,
          a.port,
        ),
      ).toMatchObject({ status: "recorded", acceptance: "rejected", financialState: "settled" });
      const after = await a.record();
      expect(after.originalOutcome).toEqual(before.outcome);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      const native = await f.db.meteringUsageEvidence.findFirstOrThrow();
      expect(native.receipt).toMatchObject({ costCents: "0.0000", quantity: "0.000000" });
      if (!after.attemptId) throw new Error("Fixture attempt missing.");
      const attemptId = after.attemptId;
      expect(await f.db.$transaction((tx) => localCanonicalFinancialState(tx, attemptId))).toBe(
        "settled",
      );
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
});
