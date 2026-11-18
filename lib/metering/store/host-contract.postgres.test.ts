import { Prisma } from "@/lib/generated/prisma/client";
import { afterAll, expect, test } from "vitest";
import {
  closeOfflineConformancePool,
  createOfflineConformanceFixture,
} from "./conformance-offline.test-fixture";
import { transactions } from "./host-sql";
import { command, receipt, ref, request } from "./test-data";
import { fixture } from "./test-fixture";

const create = process.env.METERING_TEST_DATABASE_URL ? fixture : createOfflineConformanceFixture;
afterAll(closeOfflineConformancePool);

test("raw numeric and int8 parsing retain every digit before host normalization", async () => {
  const f = await create();
  try {
    await f.client().$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ amount: Prisma.Decimal; count: bigint }[]>`
        SELECT 92233720368547758079223372036854775807::numeric AS amount,
          9223372036854775807::bigint AS count`;
      expect(Prisma.Decimal.isDecimal(row.amount)).toBe(true);
      expect(row.amount.toFixed()).toBe("92233720368547758079223372036854775807");
      expect(row.count).toBe(9223372036854775807n);
    });
    expect(
      await transactions(f.client(), f.schema, f.counters).read((sql) =>
        sql.query(Prisma.sql`
      SELECT sum(n * power(10::numeric, 18-scale)) AS amount, count(*) AS count FROM
        (VALUES (9223372036854775807::bigint, 0), (9223372036854775807::bigint, 18)) AS v(n,scale)`),
      ),
    ).toEqual([
      { amount: (9223372036854775807n * 10n ** 18n + 9223372036854775807n).toString(), count: "2" },
    ]);
  } finally {
    await f.close();
  }
});

test("migration replay never drops the scale column or rewrites its identity", async () => {
  const f = await create();
  try {
    const read = () =>
      transactions(f.client(), f.schema, f.counters).read((sql) =>
        sql.query(Prisma.sql`
      SELECT attnum FROM pg_attribute WHERE attrelid='metering_receipt'::regclass AND attname='cost_scale' AND NOT attisdropped`),
      );
    const before = await read();
    expect(before).toHaveLength(1);
    await f.replayMoneyMigration();
    expect(await read()).toEqual(before);
  } finally {
    await f.close();
  }
});

test.each(["search", "serpapi"])(
  "%s legacy invoice preserves unknown usage instead of admission estimates",
  async (provider) => {
    const f = await create();
    try {
      const input = {
        ...request(),
        provider,
        estimate: [
          { unit: "budget_cents", value: 999n, scale: 4 },
          { unit: "requests", value: 1n, scale: 0 },
          { unit: "units", value: 1n, scale: 0 },
        ],
      };
      const reserved = await f.store.reserve(input);
      if (reserved.outcome !== "reserved") throw new Error("reserve fixture");
      const grant = await f.store.markDispatchIntent({
        ...command(reserved.operation),
        holder: "h",
        leaseTtlMs: 1000,
      });
      if (!("granted" in grant) || !grant.granted) throw new Error("dispatch fixture");
      const proof = {
        ...receipt(),
        providerRequestId: "unknown-usage",
        measurements: [
          { unit: "requests", certainty: "unknown" as const, quantity: null },
          { unit: "units", certainty: "unknown" as const, quantity: null },
        ],
        cost: { certainty: "unknown" as const, money: null },
      };
      await f.store.settle({
        ...command(grant.operation),
        authority: { kind: "lease", leaseId: grant.lease.leaseId },
        receipt: proof,
      });
      const original = (await f.store.getOperation(ref(input)))?.receipts[0];
      expect(
        await f.store.importBilling({
          scope: input.scope,
          provider,
          fileHash: "a".repeat(64),
          window: { from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" },
          expectedPreviousImportId: null,
          attribution: { fundingSource: "byok", costOwner: "u1" },
          lines: [
            {
              providerRequestId: "unknown-usage",
              occurredAt: proof.occurredAt,
              cost: { units: 100n, currency: "USD" },
            },
          ],
        }),
      ).toMatchObject({ outcome: "imported" });
      const receipts = (await f.store.getOperation(ref(input)))?.receipts;
      expect(receipts).toHaveLength(2);
      expect(receipts?.[0]).toEqual(original);
      const latest = receipts?.[1];
      for (const unit of ["requests", "units"])
        expect(latest?.measurements.find((m) => m.unit === unit)).toEqual({
          unit,
          certainty: "unknown",
          quantity: null,
        });
      expect(latest?.measurements.find((m) => m.unit === "budget_cents")).toEqual(
        provider === "serpapi"
          ? { unit: "budget_cents", certainty: "unknown", quantity: null }
          : {
              unit: "budget_cents",
              certainty: "measured",
              quantity: { unit: "budget_cents", value: 100n, scale: 4 },
            },
      );
    } finally {
      await f.close();
    }
  },
);
