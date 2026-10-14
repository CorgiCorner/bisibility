import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import { describe, expect, it } from "vitest";
import { hostedSubmitFixture, hostMeasurementDatabase } from "./host.postgres.test-fixture";
import { retainOriginalLocalSubmit } from "./proof-retention";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("project-owned original proof retention and database deletion guards (full schema)", () => {
  it("blocks direct project deletion when the original received reply was lost before Store persistence", async () => {
    const f = await hostMeasurementDatabase();
    try {
      await hostedSubmitFixture(f, "received_lost");
      await expect(f.db.project.delete({ where: { id: f.project.id } })).rejects.toThrow();
      expect(await f.db.project.count()).toBe(1);
      expect(await f.db.localOriginalSubmitProof.count()).toBe(1);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("blocks true response loss even when no diagnostic proof exists", async () => {
    const f = await hostMeasurementDatabase();
    try {
      await hostedSubmitFixture(f, "lost");
      expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
      await expect(f.db.project.delete({ where: { id: f.project.id } })).rejects.toThrow();
      expect(await f.db.project.count()).toBe(1);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("blocks owner-account cascade until original accepted tasks are collected", async () => {
    const f = await hostMeasurementDatabase();
    try {
      await hostedSubmitFixture(f, "accepted");
      await expect(f.db.user.delete({ where: { id: f.owner.id } })).rejects.toThrow();
      expect(await f.db.user.findUnique({ where: { id: f.owner.id } })).not.toBeNull();
      expect(await f.db.project.count()).toBe(1);
      expect(await f.db.localOriginalSubmitProof.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("blocks collected tasks when canonical native money is unresolved", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "unknown_cost");
      const lease = await h.lease("collect");
      await collectLocalMeasurementItem(
        h.reference,
        f.writerContext,
        lease,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      await expect(f.db.project.delete({ where: { id: f.project.id } })).rejects.toThrow();
      expect(await f.db.project.count()).toBe(1);
      expect(await f.db.localOriginalSubmitProof.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("cascades terminal diagnostic proof only and preserves canonical Meter facts", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "accepted");
      const lease = await h.lease("collect");
      await collectLocalMeasurementItem(
        h.reference,
        f.writerContext,
        lease,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      const finance = {
        evidence: await f.db.meteringUsageEvidence.count(),
        receipts: await f.db.meteringReceipt.count(),
        operations: await f.db.meteringOperation.count(),
      };
      await f.db.project.delete({ where: { id: f.project.id } });
      expect(await f.db.project.count()).toBe(0);
      expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
      expect(await f.db.meteringUsageEvidence.count()).toBe(finance.evidence);
      expect(await f.db.meteringReceipt.count()).toBe(finance.receipts);
      expect(await f.db.meteringOperation.count()).toBe(finance.operations);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("allows terminal owner-account cascade with the same diagnostic cleanup", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "accepted");
      const lease = await h.lease("collect");
      await collectLocalMeasurementItem(
        h.reference,
        f.writerContext,
        lease,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      const native = await f.db.meteringUsageEvidence.findFirstOrThrow();
      await f.db.user.delete({ where: { id: f.owner.id } });
      expect(await f.db.project.count()).toBe(0);
      expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
      expect(
        (await f.db.meteringUsageEvidence.findUniqueOrThrow({ where: { id: native.id } }))
          .principal,
      ).toBe(native.principal);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("refuses direct deletion and mutation of original diagnostic response proof", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "accepted");
      const namespace_attemptId = {
        namespace: h.binding().namespace,
        attemptId: h.binding().attemptId,
      };
      await expect(
        f.db.localOriginalSubmitProof.delete({ where: { namespace_attemptId } }),
      ).rejects.toThrow();
      await expect(
        f.db.localOriginalSubmitProof.update({
          where: { namespace_attemptId },
          data: { bodyHash: "0".repeat(64) },
        }),
      ).rejects.toThrow();
      expect(await f.db.localOriginalSubmitProof.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("serializes replayed response capture with terminal project deletion without orphan diagnostics", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "accepted");
      const lease = await h.lease("collect");
      await collectLocalMeasurementItem(
        h.reference,
        f.writerContext,
        lease,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      const results = await Promise.allSettled([
        f.db.project.delete({ where: { id: f.project.id } }),
        retainOriginalLocalSubmit(f.db, h.binding(), h.replies[0]),
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(await f.db.project.count()).toBe(0);
      expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
      expect(await f.db.meteringUsageEvidence.count()).toBe(1);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
});
