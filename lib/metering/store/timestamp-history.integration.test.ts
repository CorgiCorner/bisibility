import { Prisma } from "@/lib/generated/prisma/client";
import { historicalOperation } from "@/lib/metering/history-mapping";
import { source } from "@/lib/metering/history-test-data";
import { runHistoricalImport } from "@/lib/metering/host-history-migration";
import { expect, test } from "vitest";
import { importHistoricalEvidence } from "./host-history";
import { createSql, lock, transactions } from "./host-sql";
import { createPostgresStore } from "./index";
import { operationsReader } from "./operations";
import { command, receipt, ref, request } from "./test-data";
import { fixture } from "./test-fixture";
import { timestampContractKey } from "./timestamp-history";

async function forgetContract(f: Awaited<ReturnType<typeof fixture>>) {
  await f.client().$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${f.schema}"`)}`);
    // Model the pre-adoption ledger: neither the UTC contract nor its audit exists.
    // The initial fixture has already adopted, so removing only one leaves a partial state.
    await tx.$executeRaw`DELETE FROM metering_metadata WHERE key IN (${timestampContractKey},'bisibility.transport_fence_audit')`;
    expect(
      await tx.$queryRaw`SELECT key FROM metering_metadata WHERE key IN (${timestampContractKey},'bisibility.transport_fence_audit')`,
    ).toEqual([]);
  });
}
const adopt = (f: Awaited<ReturnType<typeof fixture>>) =>
  createPostgresStore({ prisma: f.client(), clock: f.clock, schema: f.schema });

test.each(["query", "execute", "lock", "historical-evidence", "historical-batch"])(
  "direct transaction %s refuses unproved history before its first mutation",
  async (kind) => {
    const f = await fixture(undefined, { timeZone: "America/New_York" });
    try {
      await f.store.reserve(request("unproved-direct"));
      await forgetContract(f);
      const before = await f.store.getOperation(ref(request("unproved-direct")));
      await expect(
        f.client().$transaction(async (tx) => {
          await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${f.schema}"`)}`);
          const sql = createSql(tx, f.counters);
          if (kind === "query") return sql.query(Prisma.sql`SELECT * FROM metering_operation`);
          if (kind === "execute")
            return sql.execute(
              Prisma.sql`INSERT INTO metering_metadata(key,value) VALUES('direct-mutation','bad')`,
            );
          if (kind === "lock") return lock(sql, "direct-mutation");
          if (kind === "historical-batch") return runHistoricalImport(sql, "test", 10);
          return importHistoricalEvidence(sql, {
            migrationId: "direct-proof",
            sourceId: "direct-proof",
            sourceHash: "direct-proof",
            operation: historicalOperation(
              source({ id: "direct-proof" }),
              "test",
              "2026-10-01T00:00:00.000Z",
            ),
            cutoverAt: "2026-10-01T00:00:00.000Z",
          });
        }),
      ).rejects.toThrow(
        kind.startsWith("historical")
          ? "no retained timestamp snapshot"
          : "requires prior UTC write adoption",
      );
      expect(await f.store.getOperation(ref(request("unproved-direct")))).toEqual(before);
      const rows = await f
        .client()
        .$queryRaw(
          Prisma.sql`SELECT key FROM ${Prisma.raw(`"${f.schema}".metering_metadata`)} WHERE key IN (${timestampContractKey},'direct-mutation')`,
        );
      expect(rows).toEqual([]);
      const [history] = await f
        .client()
        .$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM ${Prisma.raw(`"${f.schema}".metering_history_import`)}`,
        );
      expect(history.count).toBe(0n);
    } finally {
      await f.close();
    }
  },
);
async function intent(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  const input = request(id);
  await f.store.reserve(input);
  await f.store.markDispatchIntent({
    ...ref(input),
    commandId: `intent-${id}`,
    expectedVersion: 1,
    holder: "worker",
    leaseTtlMs: 1000,
  });
  return input;
}

test("adopts a nonempty UTC ledger with complete current command snapshots", async () => {
  const f = await fixture();
  try {
    const input = await intent(f, "proved");
    const before = await f.store.getOperation(ref(input));
    await forgetContract(f);
    const store = await adopt(f);
    expect(await store.getOperation(ref(input))).toEqual(before);
    await f.restart();
    expect(await f.store.getOperation(ref(input))).toEqual(before);
  } finally {
    await f.close();
  }
});

test("refuses an unproven reserve even in UTC and leaves its dates and marker untouched", async () => {
  const f = await fixture();
  try {
    const input = request("ambiguous");
    await f.store.reserve(input);
    await forgetContract(f);
    const before = await f.store.getOperation(ref(input));
    await expect(adopt(f)).rejects.toThrow("no retained timestamp snapshot");
    expect(await f.store.getOperation(ref(input))).toEqual(before);
    const [marker] = await f
      .client()
      .$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*) FROM ${Prisma.raw(`"${f.schema}".metering_metadata`)} WHERE key=${timestampContractKey}`,
      );
    expect(marker.count).toBe(0n);
  } finally {
    await f.close();
  }
});

test("checks every operation and refuses mismatched physical UTC without repairing it", async () => {
  const f = await fixture();
  try {
    await intent(f, "a-proved");
    const input = await intent(f, "z-mismatch");
    await f.client().$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${f.schema}"`)}`);
      await tx.$executeRaw`UPDATE metering_operation SET created_at=created_at-interval '2 hours' WHERE operation_id=${input.operationId}`;
    });
    await forgetContract(f);
    const before = await f.store.getOperation(ref(input));
    await expect(adopt(f)).rejects.toThrow("disagrees with its immutable timestamp evidence");
    expect(await f.store.getOperation(ref(input))).toEqual(before);
  } finally {
    await f.close();
  }
});

test.each(["Europe/Warsaw", "America/New_York"])(
  "DB fence refuses non-UTC %s inserts and updates atomically",
  async (zone) => {
    const f = await fixture();
    try {
      const input = request("guarded");
      await f.store.reserve(input);
      const before = await f.store.getOperation(ref(input));
      for (const kind of ["insert", "update"] as const) {
        await expect(
          f.client().$transaction(async (tx) => {
            await tx.$executeRaw(
              Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${f.schema}"`)}`,
            );
            await tx.$queryRaw`SELECT set_config('TimeZone',${zone},true)`;
            await tx.$executeRaw`INSERT INTO metering_metadata(key,value) VALUES('rollback-proof','temporary')`;
            if (kind === "update")
              await tx.$executeRaw`UPDATE metering_operation SET updated_at=${new Date("2026-09-23T13:00:00.000Z")} WHERE operation_id=${input.operationId}`;
            else
              await tx.$executeRaw`INSERT INTO metering_operation SELECT operation_pk||'-copy',namespace,principal,operation_id||'-copy',state,version,semantic_hash,budget_epochs,reservation_expires_at,lease_id,lease_holder,lease_expires_at,lease_kind,created_at,updated_at,input,warnings,alerts FROM metering_operation WHERE operation_id=${input.operationId}`;
          }),
        ).rejects.toThrow("Metering writes require a UTC session");
        expect(await f.store.getOperation(ref(input))).toEqual(before);
        const rows = await f
          .client()
          .$queryRaw(
            Prisma.sql`SELECT key FROM ${Prisma.raw(`"${f.schema}".metering_metadata`)} WHERE key='rollback-proof'`,
          );
        expect(rows).toEqual([]);
      }
    } finally {
      await f.close();
    }
  },
);

test("read-only ownership projection refuses a missing marker without bootstrapping it", async () => {
  const f = await fixture();
  try {
    await intent(f, "read-only");
    await forgetContract(f);
    const read = transactions(f.client(), f.schema, f.counters).read((sql) =>
      operationsReader(f.clock, "retained-key")(sql, {
        scope: { kind: "namespace", namespace: "test" },
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
      }),
    );
    await expect(read).rejects.toThrow("read path requires prior UTC write adoption");
    const rows = await f
      .client()
      .$queryRaw(
        Prisma.sql`SELECT value FROM ${Prisma.raw(`"${f.schema}".metering_metadata`)} WHERE key=${timestampContractKey}`,
      );
    expect(rows).toEqual([]);
    // Explicit write construction adopts proved history; the same read-only path then works.
    await adopt(f);
    const page = await transactions(f.client(), f.schema, f.counters).read((sql) =>
      operationsReader(f.clock, "retained-key")(sql, {
        scope: { kind: "namespace", namespace: "test" },
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
      }),
    );
    expect(page.operations).toHaveLength(1);
  } finally {
    await f.close();
  }
});

test.each([
  "unobserved",
  "correction",
  "opaque-namespace",
  "shifted-epoch",
  "wrong-owner",
] as const)("immutable billing timestamp evidence: %s", async (kind) => {
  const f = await fixture();
  f.clock.set("2026-09-23T12:00:00.000Z");
  const namespace = kind === "opaque-namespace" ? "prod:unobserved:tenant" : "test";
  try {
    if (kind === "correction") {
      const reserved = await f.store.reserve(request("observed"));
      if (reserved.outcome !== "reserved") throw new Error("fixture reservation");
      const granted = await f.store.markDispatchIntent({
        ...command(reserved.operation),
        holder: "worker",
        leaseTtlMs: 1000,
      });
      if (!("granted" in granted) || !granted.granted) throw new Error("fixture dispatch");
      await f.store.settle({
        ...command(granted.operation),
        authority: { kind: "lease", leaseId: granted.lease.leaseId },
        receipt: { ...receipt(), providerRequestId: "bill-native" },
      });
      f.clock.advance(1000);
    }
    const imported = await f.store.importBilling({
      scope: { namespace, principal: "u1", connection: "c1" },
      provider: "search",
      fileHash: "b".repeat(64),
      window: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
      expectedPreviousImportId: null,
      attribution: { fundingSource: "byok", costOwner: "u1" },
      lines: [
        {
          providerRequestId: "bill-native",
          occurredAt: "2026-09-23T12:00:00.000Z",
          cost: { units: 100n, currency: "USD" },
        },
      ],
    });
    if (imported.outcome !== "imported") throw new Error("fixture invoice");
    const id = kind === "correction" ? "observed" : imported.record.unobservedOperationIds[0];
    if (!id) throw new Error("fixture operation id");
    if (["shifted-epoch", "wrong-owner"].includes(kind))
      await f.client().$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${f.schema}"`)}`);
        if (kind === "shifted-epoch")
          await tx.$executeRaw`UPDATE metering_operation SET created_at=created_at-interval '2 hours' WHERE operation_id=${id}`;
        else {
          await tx.$executeRaw`ALTER TABLE metering_import DISABLE TRIGGER metering_import_immutable`;
          await tx.$executeRaw`UPDATE metering_import SET body=jsonb_set(body,'{scope,principal}','"different-owner"'::jsonb)`;
          await tx.$executeRaw`ALTER TABLE metering_import ENABLE TRIGGER metering_import_immutable`;
        }
      });
    const reference = { namespace, principal: "u1", operationId: id };
    const before = await f.store.getOperation(reference);
    await forgetContract(f);
    if (["shifted-epoch", "wrong-owner"].includes(kind))
      await expect(adopt(f)).rejects.toThrow("Metering UTC adoption refused");
    else expect(await (await adopt(f)).getOperation(reference)).toEqual(before);
    expect(await f.store.getOperation(reference)).toEqual(before);
  } finally {
    await f.close();
  }
});
