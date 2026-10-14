import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import { prepareLocalMeasurementRun } from "@/lib/local-monitoring-store/prepare-run";
import { describe, expect, it } from "vitest";
import { hostedSubmitFixture, hostMeasurementDatabase } from "./host.postgres.test-fixture";
import { reconcileLocalHostItem } from "./reconcile";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
// Requires root's reviewed operational keyword SET NULL tombstone + retained continuation changes.
suite(
  "keyword deletion preserves immutable local execution rather than deleting custody (full schema)",
  () => {
    it("retains true-response-loss item/owner/axes while the deleted Keyword cannot launch new work", async () => {
      const f = await hostMeasurementDatabase();
      try {
        const h = await hostedSubmitFixture(f, "lost");
        const before = await f.db.localMeasurementTarget.findFirstOrThrow({
          where: { publicId: h.target.id },
        });
        await f.db.keyword.delete({ where: { id: f.keyword.id } });
        const retained = await f.db.localMeasurementTarget.findUniqueOrThrow({
          where: { id: before.id },
        });
        expect(retained.keywordId).toBeNull();
        expect({ ...retained, keywordId: before.keywordId }).toEqual(before);
        expect(await f.db.localMeasurementRunItem.count()).toBe(1);
        expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
        expect(await f.db.meteringUsageEvidence.count()).toBe(1);
        expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
        await expect(
          prepareLocalMeasurementRun(f.launch([h.target]), f.writerContext, f.ports, f.db),
        ).rejects.toThrow();
        const lease = await h.lease("reconcile");
        expect(
          await reconcileLocalHostItem(h.reference, f.writerContext, lease, f.clock, f.db),
        ).toMatchObject({
          acceptance: "unknown",
          providerEvidence: "missing_original_submit_evidence",
        });
        expect(f.counters.submissions).toBe(1);
        expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      } finally {
        await f.close();
      }
    }, 120_000);
    it("can reconcile the retained original response and collect only its original IDs after tombstoning", async () => {
      const f = await hostMeasurementDatabase();
      try {
        const h = await hostedSubmitFixture(f, "received_lost");
        await f.db.keyword.delete({ where: { id: f.keyword.id } });
        const reconcile = await h.lease("reconcile");
        expect(
          await reconcileLocalHostItem(h.reference, f.writerContext, reconcile, f.clock, f.db),
        ).toMatchObject({ acceptance: "accepted", financialState: "settled" });
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
        expect(await f.db.observationRun.count()).toBe(1);
        expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
        expect(f.counters.submissions).toBe(1);
        expect(f.counters.collections).toBe(1);
      } finally {
        await f.close();
      }
    }, 120_000);
    it("refuses direct item/run/target removal for proofless possibly-sent retained work", async () => {
      const f = await hostMeasurementDatabase();
      try {
        const h = await hostedSubmitFixture(f, "lost");
        await expect(
          f.db.localMeasurementRunItem.delete({ where: { id: h.item.id } }),
        ).rejects.toThrow();
        await expect(
          f.db.localMeasurementRun.delete({ where: { publicId: h.prepared.id } }),
        ).rejects.toThrow();
        await expect(
          f.db.localMeasurementTarget.delete({ where: { publicId: h.target.id } }),
        ).rejects.toThrow();
        expect(await f.db.localMeasurementRunItem.count()).toBe(1);
        expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      } finally {
        await f.close();
      }
    }, 120_000);
    it("does not allow direct operational keyword NULL assignment to impersonate a real deletion", async () => {
      const f = await hostMeasurementDatabase();
      try {
        const h = await hostedSubmitFixture(f, "accepted");
        await expect(
          f.db
            .$executeRaw`UPDATE public.local_measurement_targets SET "keywordId"=NULL WHERE "publicId"=${h.target.id}`,
        ).rejects.toThrow();
        expect(
          (await f.db.localMeasurementTarget.findFirstOrThrow({ where: { publicId: h.target.id } }))
            .keywordId,
        ).toBe(f.keyword.id);
        expect(await f.db.keyword.count()).toBe(1);
      } finally {
        await f.close();
      }
    }, 120_000);
  },
);
