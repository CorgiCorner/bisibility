import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { historicalOperation } from "@/lib/metering/history-mapping";
import { source } from "@/lib/metering/history-test-data";
import { importHistoricalEvidence } from "@/lib/metering/store/host-history";
import { createSql } from "@/lib/metering/store/host-sql";
import { ref, request } from "@/lib/metering/store/test-data";
import { fixture } from "@/lib/metering/store/test-fixture";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Operation } from "@usagekit/core";
import { Pool } from "pg";
import { expect, test } from "vitest";

const instant = "2026-09-23T12:00:00.000Z";

test.each(["ordinary", "joined", "history"] as const)(
  "%s stores and reopens the true UTC instant with non-UTC ingress and oracle sessions",
  async (kind) => {
    const f = await fixture(undefined, { timeZone: "Europe/Warsaw" });
    f.clock.set(instant);
    const oracle = new Pool({ connectionString: f.url, max: 1 });
    try {
      const [ingress] = await f.client().$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
      expect(ingress?.TimeZone).toBe("Europe/Warsaw");
      const input = request(`time-${kind}`);
      let operationId = input.operationId;
      let returned: Operation | null | undefined;
      if (kind === "ordinary") {
        const reserved = await f.store.reserve(input);
        if (reserved.outcome !== "reserved") throw new Error("fixture reserve");
        returned = await f.store.getOperation(ref(input));
      } else if (kind === "joined") {
        returned = await f.client().$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT set_config('TimeZone',${"America/New_York"},true)`);
          await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${f.schema}"`)}`);
          const store = await createTransactionBoundStore({ transaction: tx, clock: f.clock });
          await store.reserve(input);
          return store.getOperation(ref(input));
        });
      } else {
        const op = historicalOperation(
          source({ id: "time-proof", createdAt: instant }),
          "test",
          instant,
        );
        operationId = op.operationId;
        await f.client().$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT set_config('TimeZone',${"Europe/Warsaw"},true)`);
          await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${f.schema}"`)}`);
          await importHistoricalEvidence(createSql(tx, f.counters), {
            migrationId: "time-proof",
            sourceId: "time-proof",
            sourceHash: "time-proof",
            operation: op,
            cutoverAt: instant,
          });
        });
        returned = await f.store.getOperation({
          namespace: "test",
          principal: op.scope.principal,
          operationId,
        });
      }
      for (const zone of ["Europe/Warsaw", "America/New_York", "UTC"]) {
        const client = await oracle.connect();
        try {
          await client.query("SELECT set_config('TimeZone',$1,false)", [zone]);
          const { rows } = await client.query(
            `SELECT created_at,extract(epoch FROM created_at)::text AS epoch FROM "${f.schema}".metering_operation WHERE operation_id=$1`,
            [operationId],
          );
          expect(rows[0]?.created_at.toISOString()).toBe(instant);
          expect(rows[0]?.epoch).toBe("1790164800.000000");
        } finally {
          client.release();
        }
      }
      if (!returned) throw new Error("Missing timestamp fixture operation");
      expect(returned.createdAt).toBe(instant);
      await f.restart();
      const reopened = await f.store.getOperation({
        namespace: "test",
        principal: returned.scope.principal,
        operationId,
      });
      expect(reopened?.createdAt).toBe(instant);
      expect(reopened?.reservationExpiresAt).toBe(returned?.reservationExpiresAt);
      if (kind !== "history") {
        const replay = await f.store.reserve(input);
        expect(replay).toMatchObject({ outcome: "reserved", replayed: true, operation: reopened });
        f.clock.advance(300001);
        expect(await f.store.expireReservations({ namespace: "test" })).toMatchObject({ count: 1 });
      }
    } finally {
      await oracle.end();
      await f.close();
    }
  },
);

test.each(["Europe/Warsaw", "America/New_York", "UTC"])(
  "host startup config preserves real Date instants against %s URL options",
  async (zone) => {
    const f = await fixture(undefined, { timeZone: "Europe/Warsaw" });
    const url = new URL(f.url);
    url.searchParams.set("schema", f.schema);
    url.searchParams.set("options", `-c statement_timeout=15000 -c TimeZone=${zone}`);
    const host = new PrismaClient({
      adapter: new PrismaPg({
        ...databaseConnectionConfig(url.toString()),
        max: 1,
      }),
    });
    const oracle = new Pool({ connectionString: f.url, max: 1 });
    try {
      const [session] = await host.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
      expect(session?.TimeZone).toBe("UTC");
      f.clock.set(instant);
      const input = request(`host-startup-${zone}`);
      await f.store.reserve(input);
      await host.$executeRaw`UPDATE metering_operation SET updated_at=${new Date(instant)} WHERE operation_id=${input.operationId}`;
      const { rows } = await oracle.query(
        `SELECT updated_at FROM "${f.schema}".metering_operation WHERE operation_id=$1`,
        [input.operationId],
      );
      expect(rows[0]?.updated_at.toISOString()).toBe(instant);
      const [read] = await host.$queryRaw<
        { updated_at: Date }[]
      >`SELECT updated_at FROM metering_operation WHERE operation_id=${input.operationId}`;
      expect(read?.updated_at.toISOString()).toBe(instant);
    } finally {
      await host.$disconnect();
      await oracle.end();
      await f.close();
    }
  },
);
