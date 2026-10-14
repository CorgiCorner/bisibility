import { releaseMonitorContinuationLease } from "@/lib/local-monitor-worker/continuation-lease-release";
import type { SubmissionOutcome } from "@/lib/local-monitoring/execution-types";
import type { LocalAcceptanceProofPort } from "@/lib/local-monitoring-store/acceptance-proof";
import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import { reconcileLocalMeasurementItem } from "@/lib/local-monitoring-store/recovery";
import { describe, expect, it } from "vitest";
import { hostedSubmitFixture, hostMeasurementDatabase } from "./host.postgres.test-fixture";
import { reconcileLocalHostItem } from "./reconcile";

function fixtureAlternativeReceipt(
  outcome: SubmissionOutcome,
  clock: () => Date,
): LocalAcceptanceProofPort {
  return {
    async loadVerifiedOriginalProof(binding) {
      return {
        version: 1,
        kind: "provider_receipt",
        proofId: "synthetic-alternative-original-proof",
        attemptId: binding.attemptId,
        projectId: binding.projectId,
        operationKey: binding.operationKey,
        targetKey: binding.targetKey,
        provider: binding.provider,
        adapterVersion: binding.adapterVersion,
        device: binding.device,
        exhaustive: true,
        verifiedAt: clock().toISOString(),
        outcome,
      };
    },
  };
}
const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite(
  "original row precedes Store history and equivalent facts replay canonically (full schema)",
  () => {
    it("does not let previously retained Store history hide conflicting actual original task IDs", async () => {
      const f = await hostMeasurementDatabase();
      try {
        const h = await hostedSubmitFixture(f, "received_lost");
        const first = await h.lease("reconcile");
        const adversarial = fixtureAlternativeReceipt(
          { ...h.replies[0], taskIds: ["synthetic-conflicting-original-task"] },
          f.clock,
        );
        await reconcileLocalMeasurementItem(
          h.reference,
          f.writerContext,
          first,
          f.clock,
          f.db,
          adversarial,
        );
        const next = await h.lease("reconcile");
        await expect(
          reconcileLocalHostItem(h.reference, f.writerContext, next, f.clock, f.db),
        ).rejects.toThrow("adds IDs after exhaustive acceptance");
        expect(await f.db.localOriginalSubmitProof.count()).toBe(1);
        expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
        expect(f.counters.submissions).toBe(1);
        expect(await f.db.observationRun.count()).toBe(0);
      } finally {
        await f.close();
      }
    }, 120_000);
    it("keeps semantic no-op history immutable and permits terminal deletion when only receivedAt differs", async () => {
      const f = await hostMeasurementDatabase();
      try {
        const h = await hostedSubmitFixture(f, "received_lost");
        const first = await h.lease("reconcile");
        const sameFacts = {
          ...h.replies[0],
          receivedAt: new Date(new Date(h.replies[0].receivedAt).getTime() + 1).toISOString(),
        };
        await reconcileLocalMeasurementItem(
          h.reference,
          f.writerContext,
          first,
          f.clock,
          f.db,
          fixtureAlternativeReceipt(sameFacts, f.clock),
        );
        const before = await f.db.localMeasurementRunItem.findUniqueOrThrow({
          where: { id: h.item.id },
        });
        const next = await h.lease("reconcile");
        expect(
          await reconcileLocalHostItem(h.reference, f.writerContext, next, f.clock, f.db),
        ).toMatchObject({
          acceptance: "accepted",
          providerEvidence: "retained_original_submit",
          financialState: "settled",
        });
        const after = await f.db.localMeasurementRunItem.findUniqueOrThrow({
          where: { id: h.item.id },
        });
        expect(after.record).toEqual(before.record);
        expect(after.version).toBe(before.version);
        await expect(h.lease("collect")).rejects.toMatchObject({
          name: "LocalMeasurementConflictError",
        });
        await releaseMonitorContinuationLease(f.db, next);
        const collect = await h.lease("collect");
        await collectLocalMeasurementItem(
          h.reference,
          f.writerContext,
          collect,
          f.ports.adapter,
          f.normalizer,
          f.clock,
          f.db,
        );
        await f.db.project.delete({ where: { id: f.project.id } });
        expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
        expect(await f.db.meteringUsageEvidence.count()).toBe(1);
        expect(f.counters.submissions).toBe(1);
        expect(f.counters.collections).toBe(1);
      } finally {
        await f.close();
      }
    }, 120_000);
  },
);
