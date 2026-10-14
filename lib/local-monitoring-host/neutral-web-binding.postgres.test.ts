import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import { describe, expect, it } from "vitest";
import { hostedSubmitFixture, hostMeasurementDatabase } from "./host.postgres.test-fixture";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("neutral Web point observation authority is separate from RankCheck definitions", () => {
  async function collected() {
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
      const row = await f.db.observationRun.findFirstOrThrow({
        where: { projectId: f.project.id, neutralExecutionItemId: h.item.id },
      });
      return { f, h, row };
    } catch (error) {
      await f.close();
      throw error;
    }
  }
  it("retains exact original point tokens without inventing a RankCheck definition binding", async () => {
    const { f, h, row } = await collected();
    try {
      const target = await f.db.localMeasurementTarget.findUniqueOrThrow({
        where: { id: h.item.targetId },
      });
      expect(row).toMatchObject({
        definitionBindingId: null,
        rankCheckId: null,
        neutralExecutionItemId: h.item.id,
        provider: h.item.provider,
        requestPolicy: {
          evidence: { targetRevision: target.targetKey },
          localExecution: { operationKey: h.item.operationKey, targetKey: target.targetKey },
        },
      });
      expect(await f.db.measurementExecutionBinding.count()).toBe(0);
      expect(f.counters).toEqual({ submissions: 1, collections: 1 });
    } finally {
      await f.close();
    }
  }, 120000);
  it("refuses revision, adapter, depth or provider tampering and cannot escape its neutral surface", async () => {
    const { f, row } = await collected();
    try {
      for (const [path, value] of [
        ["{evidence,targetRevision}", '"other-target"'],
        ["{evidence,policyRevision}", '"other-policy"'],
        ["{evidence,adapterVersion}", '"other-adapter"'],
        ["{localExecution,operationKey}", '"other-operation"'],
        ["{depth}", "999"],
      ]) {
        await expect(
          f.client.query(
            `UPDATE public.observation_runs SET "requestPolicy"=jsonb_set("requestPolicy",$1::text[],$2::jsonb) WHERE id=$3`,
            [path, value, row.id],
          ),
        ).rejects.toThrow("neutral_observation_binding_mismatch");
      }
      for (const [path, value] of [
        ["{device}", '"mobile"'],
        ["{language}", '"pl"'],
      ]) {
        await expect(
          f.client.query(
            `UPDATE public.observation_runs SET "configuredScope"=jsonb_set("configuredScope",$1::text[],$2::jsonb) WHERE id=$3`,
            [path, value, row.id],
          ),
        ).rejects.toThrow("neutral_observation_binding_mismatch");
      }
      await expect(
        f.client.query(`UPDATE public.observation_runs SET provider='other-provider' WHERE id=$1`, [
          row.id,
        ]),
      ).rejects.toThrow("neutral_observation_binding_mismatch");
      await expect(
        f.client.query(`UPDATE public.observation_runs SET surface='maps' WHERE id=$1`, [row.id]),
      ).rejects.toThrow("neutral_observation_binding_immutable");
      await expect(
        f.client.query(
          `UPDATE public.observation_runs SET "neutralExecutionItemId"='other-item' WHERE id=$1`,
          [row.id],
        ),
      ).rejects.toThrow("neutral_observation_binding_immutable");
      expect(await f.db.observationRun.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
      expect(f.counters).toEqual({ submissions: 1, collections: 1 });
    } finally {
      await f.close();
    }
  }, 120000);
  it("cannot convert an existing unbound RankCheck row into the original neutral item", async () => {
    const { f, row } = await collected();
    try {
      const check = await f.db.rankCheck.create({
        data: {
          keywordId: f.keyword.id,
          provider: row.provider,
          publicId: makePublicId("check"),
        },
      });
      const legacyId = randomUUID();
      await f.client.query(
        `INSERT INTO public.observation_runs
        (id,"projectId","rankCheckId",provider,surface,engine,"requestPolicy",completeness,"configuredScope","executedAt")
        SELECT $1,"projectId",$2,provider,surface,engine,"requestPolicy"-'evidence'-'localExecution',completeness,"configuredScope","executedAt"
        FROM public.observation_runs WHERE id=$3`,
        [legacyId, check.id, row.id],
      );
      const legacy = await f.db.observationRun.findUniqueOrThrow({ where: { id: legacyId } });
      await expect(
        f.client.query(
          `UPDATE public.observation_runs original
        SET "rankCheckId"=NULL,"neutralExecutionItemId"=neutral."neutralExecutionItemId","requestPolicy"=neutral."requestPolicy"
        FROM public.observation_runs neutral WHERE original.id=$1 AND neutral.id=$2`,
          [legacyId, row.id],
        ),
      ).rejects.toThrow("neutral_observation_binding_immutable");
      expect(await f.db.observationRun.findUniqueOrThrow({ where: { id: legacyId } })).toEqual(
        legacy,
      );
      expect(f.counters).toEqual({ submissions: 1, collections: 1 });
    } finally {
      await f.close();
    }
  }, 120000);
  it("does not authorize a noop observation write after original native custody is corrupted", async () => {
    const { f, h, row } = await collected();
    try {
      const original = await f.db.meteringPaidAttemptContext.findUniqueOrThrow({
        where: {
          namespace_operation_id: {
            namespace: h.binding().namespace,
            operation_id: h.binding().attemptId,
          },
        },
      });
      await expect(
        f.db.$executeRaw`UPDATE public.metering_paid_attempt_context SET context=context-'projectId'
          WHERE namespace=${h.binding().namespace} AND operation_id=${h.binding().attemptId}`,
      ).rejects.toThrow("Committed transport fence identity and evidence are immutable");
      await expect(
        f.db.$transaction(async (tx) => {
          // This database belongs only to this disposable fixture. Simulate already-corrupt custody,
          // then restore its fence before exercising the separate neutral observation guard.
          await tx.$executeRaw`ALTER TABLE public.metering_paid_attempt_context DISABLE TRIGGER metering_transport_fence`;
          await tx.$executeRaw`UPDATE public.metering_paid_attempt_context SET context=context-'projectId'
          WHERE namespace=${h.binding().namespace} AND operation_id=${h.binding().attemptId}`;
          await tx.$executeRaw`ALTER TABLE public.metering_paid_attempt_context ENABLE TRIGGER metering_transport_fence`;
          await tx.$executeRaw`UPDATE public.observation_runs SET completeness=completeness WHERE id=${row.id}`;
        }),
      ).rejects.toThrow("neutral_observation_binding_mismatch");
      const enabled = await f.client.query(
        "SELECT tgenabled FROM pg_trigger WHERE tgname='metering_transport_fence' AND tgrelid='public.metering_paid_attempt_context'::regclass",
      );
      expect(enabled.rows).toEqual([{ tgenabled: "O" }]);
      expect(
        await f.db.meteringPaidAttemptContext.findUniqueOrThrow({
          where: {
            namespace_operation_id: {
              namespace: h.binding().namespace,
              operation_id: h.binding().attemptId,
            },
          },
        }),
      ).toEqual(original);
      expect(await f.db.observationRun.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
      expect(f.counters).toEqual({ submissions: 1, collections: 1 });
    } finally {
      await f.close();
    }
  }, 120000);
});
