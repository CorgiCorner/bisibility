import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import { canonical, key } from "@usagekit/store/reference";
import { describe, expect, it } from "vitest";
import { hostedSubmitFixture, hostMeasurementDatabase } from "./host.postgres.test-fixture";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("original proof SQL authority and actual canonical lock parity (full schema)", () => {
  it("matches the real reference canonical pair and same advisory lock for escaped and Unicode values", async () => {
    const f = await hostMeasurementDatabase();
    try {
      for (const pair of [
        ["namespace", "attempt"],
        ["space namespace", 'quote"slash\\'],
        ["Żółć", "東京"],
        ["line\ncontrol\t", "nul-free"],
      ]) {
        const expected = key(pair[0], pair[1]);
        expect(expected).toBe(canonical(pair));
        const actual = await f.client.query<{ value: string }>(
          "SELECT public.local_submit_pair_key($1,$2) AS value",
          pair,
        );
        expect(actual.rows[0].value).toBe(expected);
        for (const prefix of ["metering:connection-accounting:", "metering:operation:"]) {
          await f.client.query("BEGIN");
          try {
            await f.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
              prefix + expected,
            ]);
            const result = await f.db.$transaction(
              (tx) => tx.$queryRaw<{ acquired: boolean }[]>`SELECT
              pg_try_advisory_xact_lock(hashtextextended(${prefix}||public.local_submit_pair_key(${pair[0]},${pair[1]}),0)) AS acquired`,
            );
            expect(result[0].acquired).toBe(false);
          } finally {
            await f.client.query("ROLLBACK");
          }
        }
      }
    } finally {
      await f.close();
    }
  }, 120_000);
  it("pins the actual writer fields and permits a correctly settled terminal project", async () => {
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
      const result = await f.client.query<{
        principal: string;
        scope: Record<string, unknown>;
        context: Record<string, unknown>;
      }>(
        `SELECT o.principal,
        o.input->'scope' AS scope,c.context FROM public.metering_operation o JOIN public.metering_paid_attempt_context c
        ON c.namespace=o.namespace AND c.operation_id=o.operation_id WHERE o.namespace=$1 AND o.operation_id=$2`,
        [h.binding().namespace, h.binding().attemptId],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].principal).toBe(f.owner.id);
      expect(result.rows[0].scope).toMatchObject({
        group: f.project.id,
        connection: f.connection.id,
      });
      expect(result.rows[0].context).toMatchObject({
        projectId: f.project.id,
        connectionId: f.connection.id,
        feature: "local_scan",
        correlationId: h.binding().correlationId,
      });
      await f.db.project.delete({ where: { id: f.project.id } });
      expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rejects missing and null original context/record facts with rollback, never SQL NULL false-green", async () => {
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
      for (const field of ["projectId", "connectionId", "feature", "correlationId"]) {
        await expect(
          f.db.$transaction(async (tx) => {
            await tx.$executeRaw`UPDATE public.metering_paid_attempt_context SET context=context-${field}::text
            WHERE namespace=${h.binding().namespace} AND operation_id=${h.binding().attemptId}`;
            await tx.$executeRaw`DELETE FROM public.projects WHERE id=${f.project.id}`;
          }),
        ).rejects.toThrow();
      }
      for (const replacement of [false, true]) {
        await expect(
          f.db.$transaction(async (tx) => {
            if (replacement)
              await tx.$executeRaw`UPDATE public.local_measurement_run_items SET record=jsonb_set(record,'{settlementRecorded}','null'::jsonb) WHERE id=${h.item.id}`;
            else
              await tx.$executeRaw`UPDATE public.local_measurement_run_items SET record=record-'settlementRecorded' WHERE id=${h.item.id}`;
            await tx.$executeRaw`DELETE FROM public.projects WHERE id=${f.project.id}`;
          }),
        ).rejects.toThrow();
      }
      expect(await f.db.project.count()).toBe(1);
      expect(await f.db.localOriginalSubmitProof.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("does not trust attacker TEMP tables claiming settled original finance", async () => {
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
      await expect(
        f.db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            "CREATE TEMP TABLE metering_operation AS SELECT * FROM public.metering_operation",
          );
          await tx.$executeRawUnsafe("UPDATE pg_temp.metering_operation SET state='settled'");
          await tx.$executeRawUnsafe(
            "CREATE TEMP TABLE metering_paid_attempt_context AS SELECT * FROM public.metering_paid_attempt_context",
          );
          await tx.$executeRawUnsafe(
            "CREATE TEMP TABLE local_measurement_run_items AS SELECT * FROM public.local_measurement_run_items",
          );
          await tx.$executeRawUnsafe(
            "CREATE TEMP TABLE projects AS SELECT * FROM public.projects WHERE FALSE",
          );
          await tx.$executeRaw`DELETE FROM public.projects WHERE id=${f.project.id}`;
        }),
      ).rejects.toThrow();
      expect(await f.db.project.count()).toBe(1);
      const functions = await f.client.query<{
        proconfig: string[];
      }>(`SELECT proconfig FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN ('guard_local_original_submit_proof','guard_project_local_execution_deletion','local_submit_pair_key','local_submit_outcome_facts_equal','guard_retained_local_item_deletion')`);
      expect(functions.rows).toHaveLength(5);
      for (const row of functions.rows)
        expect(row.proconfig.map((setting) => setting.replaceAll(/\s/gu, ""))).toContain(
          "search_path=public,pg_temp",
        );
    } finally {
      await f.close();
    }
  }, 120_000);
});
