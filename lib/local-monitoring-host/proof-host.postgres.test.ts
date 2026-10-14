import { releaseMonitorContinuationLease } from "@/lib/local-monitor-worker/continuation-lease-release";
import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import { prepareLocalMeasurementRun } from "@/lib/local-monitoring-store/prepare-run";
import { describe, expect, it } from "vitest";
import { hostedSubmitFixture, hostMeasurementDatabase } from "./host.postgres.test-fixture";
import { retainOriginalLocalSubmit } from "./proof-retention";
import { readLocalHostItem, readLocalHostRun } from "./read";
import { reconcileLocalHostItem } from "./reconcile";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("concrete original local proof bridge (owned full migration chain)", () => {
  it("recovers a received response retained before Store reply loss with no second POST", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "received_lost");
      const current = await h.lease("reconcile");
      expect(
        await reconcileLocalHostItem(h.reference, f.writerContext, current, f.clock, f.db),
      ).toMatchObject({
        acceptance: "accepted",
        financialState: "settled",
        providerEvidence: "retained_original_submit",
      });
      const reader = await readLocalHostRun(
        { projectId: f.project.publicId, runId: h.prepared.id },
        f.ownerContext,
        f.db,
      );
      expect(reader.items[0]).toMatchObject({
        resolution: "awaiting_collection",
        financialState: "settled",
        ownerRetained: true,
      });
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
      expect((await readLocalHostItem(h.reference, f.ownerContext, f.db)).resolution).toBe(
        "complete",
      );
      await expect(h.prepared.submitters[0].submit()).rejects.toThrow("already consumed");
      expect(f.counters.submissions).toBe(1);
      expect(f.counters.collections).toBe(1);
      expect(JSON.stringify(reader)).not.toMatch(
        /synthetic-task|synthetic-native|credentialVersion|requestHash|costCents|local-submit-proof/,
      );
    } finally {
      await f.close();
    }
  }, 120_000);
  it("does not invent task acceptance from unknown native finance after true response loss", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "lost");
      const current = await h.lease("reconcile");
      expect(
        await reconcileLocalHostItem(h.reference, f.writerContext, current, f.clock, f.db),
      ).toMatchObject({
        acceptance: "unknown",
        providerEvidence: "missing_original_submit_evidence",
      });
      expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
      const item = await readLocalHostItem(h.reference, f.ownerContext, f.db);
      expect(item).toMatchObject({
        resolution: "needs_provider_evidence",
        accountingPending: true,
        ownerRetained: true,
      });
      f.advance(61_000);
      await expect(
        prepareLocalMeasurementRun(f.launch([h.target]), f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "LocalTargetBlocked" });
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("falls back to the exact Store reply when diagnostic proof INSERT fails", async () => {
    const f = await hostMeasurementDatabase();
    try {
      await f.client.query(
        `CREATE FUNCTION public.fail_local_submit_proof() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'synthetic proof write failure' USING ERRCODE='57014'; END $$`,
      );
      await f.client.query(
        "CREATE TRIGGER fail_local_submit_proof BEFORE INSERT ON public.local_original_submit_proofs FOR EACH ROW EXECUTE FUNCTION public.fail_local_submit_proof()",
      );
      const h = await hostedSubmitFixture(f, "write_failure");
      expect(h.diagnostics).toEqual(["store_fallback_required"]);
      expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
      expect(await readLocalHostItem(h.reference, f.ownerContext, f.db)).toMatchObject({
        acceptance: "accepted",
        financialState: "settled",
      });
      const current = await h.lease("reconcile");
      expect(
        await reconcileLocalHostItem(h.reference, f.writerContext, current, f.clock, f.db),
      ).toMatchObject({ providerEvidence: "retained_store_outcome" });
      await expect(h.prepared.submitters[0].submit()).rejects.toThrow("already consumed");
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("cannot overwrite a conflicting original proof body at the same custody key", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "accepted");
      const namespace_attemptId = {
        namespace: h.binding().namespace,
        attemptId: h.binding().attemptId,
      };
      const before = await f.db.localOriginalSubmitProof.findUniqueOrThrow({
        where: { namespace_attemptId },
      });
      await expect(
        retainOriginalLocalSubmit(f.db, h.binding(), {
          ...h.replies[0],
          taskIds: ["another-original-task"],
        }),
      ).rejects.toMatchObject({ name: "OriginalSubmitProofConflictError" });
      expect(
        await f.db.localOriginalSubmitProof.findUniqueOrThrow({ where: { namespace_attemptId } }),
      ).toEqual(before);
      expect(f.counters.submissions).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("exposes unknown native money independently of proven accepted and collected IDs", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "unknown_cost");
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
      const run = await readLocalHostRun(
        { projectId: f.project.publicId, runId: h.prepared.id },
        f.ownerContext,
        f.db,
      );
      expect(run.counts.accountingPending).toBe(1);
      expect(run.items[0]).toMatchObject({
        acceptance: "accepted",
        collected: true,
        resolution: "accounting_pending",
        ownerRetained: true,
      });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("does not turn a collected positive subset into exhaustive original acceptance", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const h = await hostedSubmitFixture(f, "partial");
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
      await expect(h.lease("reconcile")).rejects.toMatchObject({
        name: "LocalMeasurementConflictError",
      });
      await releaseMonitorContinuationLease(f.db, collect);
      const reconcile = await h.lease("reconcile");
      expect(
        await reconcileLocalHostItem(h.reference, f.writerContext, reconcile, f.clock, f.db),
      ).toMatchObject({
        acceptance: "unknown",
        providerEvidence: "incomplete_original_submit_evidence",
      });
      expect(await readLocalHostItem(h.reference, f.ownerContext, f.db)).toMatchObject({
        resolution: "needs_provider_evidence",
        collected: true,
        ownerRetained: true,
        knownAcceptedTaskCount: 1,
      });
      await expect(f.db.project.delete({ where: { id: f.project.id } })).rejects.toThrow();
      expect(f.counters.submissions).toBe(1);
      expect(f.counters.collections).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
});
