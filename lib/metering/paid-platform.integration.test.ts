import { expect, test } from "vitest";
import {
  fencePaidAttemptsInTransaction,
  markPaidAttemptDispatch,
  reservePaidAttempts,
} from "./admission";
import { input, nativeReceipt, paidFixture, required } from "./paid-attempt-test-fixture";
import { correctPaidAttempt, settlePaidAttempt } from "./settlement";

async function platform(f: Awaited<ReturnType<typeof paidFixture>>) {
  const request = input();
  const [reservation] = await f.run((tx) =>
    reservePaidAttempts(
      tx,
      [
        {
          ...request,
          reservation: {
            ...request.reservation,
            fundingSource: "platform",
            estimateSource: "manual",
            estimate: [{ unit: "cents", value: 0n, scale: 4 }],
          },
          platformQuote: {
            estimate: [
              { unit: "cents", value: 20000n, scale: 4 },
              { unit: "requests", value: 1n, scale: 0 },
              { unit: "customer_cents", value: 30000n, scale: 4 },
            ],
            estimateSource: "measured",
            costOwner: "provider",
            creditAccountRef: "wallet",
            customerPriceVersion: "host-policy",
            platformPools: ["pool"],
          },
        },
      ],
      f.options,
    ),
  );
  const grant = await f.run((tx) =>
    markPaidAttemptDispatch(tx, required(reservation), "worker", f.options),
  );
  await f.run((tx) => fencePaidAttemptsInTransaction(tx, [grant], f.options));
  return {
    namespace: "test",
    principal: "owner",
    operationId: grant.operation.operationId,
    expectedVersion: grant.operation.version,
    commandId: "native",
    authority: { kind: "lease" as const, leaseId: grant.lease.leaseId },
    receipt: nativeReceipt(),
  };
}
test("unknown platform provider cost never debits a wallet or fabricates customer zero", async () => {
  const f = await paidFixture();
  try {
    const settlement = await platform(f);
    const result = await f.run((tx) =>
      settlePaidAttempt(
        tx,
        { ...settlement, receipt: nativeReceipt(true) },
        {
          ...f.options,
          acknowledgeCharge: async () => {
            throw new Error("unknown proof must not debit");
          },
        },
      ),
    );
    expect(result.operation.state).toBe("pending");
    expect(result.operation.receipts[0]?.measurements).toContainEqual({
      unit: "customer_cents",
      certainty: "unknown",
      quantity: null,
    });
  } finally {
    await f.close();
  }
});
test("wallet acknowledgement rolls back with failed Meter settlement, and corrections never reprice", async () => {
  const f = await paidFixture();
  try {
    await f.run((tx) => tx.$executeRaw`CREATE TABLE test_wallet_debits(id text primary key)`);
    const settlement = await platform(f);
    const acknowledgeCharge = async (tx: Parameters<typeof settlePaidAttempt>[0]) => {
      await tx.$executeRaw`INSERT INTO test_wallet_debits(id) VALUES('debit') ON CONFLICT DO NOTHING`;
      return {
        debitId: "debit",
        customerCents: { unit: "customer_cents", value: 30000n, scale: 4 },
      };
    };
    await expect(
      f.run((tx) =>
        settlePaidAttempt(
          tx,
          { ...settlement, expectedVersion: 999 },
          { ...f.options, acknowledgeCharge },
        ),
      ),
    ).rejects.toThrow();
    expect(await f.run((tx) => tx.$queryRaw`SELECT * FROM test_wallet_debits`)).toEqual([]);
    const settled = await f.run((tx) =>
      settlePaidAttempt(tx, settlement, { ...f.options, acknowledgeCharge }),
    );
    expect(
      (await f.run((tx) => settlePaidAttempt(tx, settlement, { ...f.options, acknowledgeCharge })))
        .replayed,
    ).toBe(true);
    f.clock.advance(60001);
    const correction = await f.run((tx) =>
      correctPaidAttempt(
        tx,
        {
          ...settlement,
          commandId: "invoice-native-correction",
          expectedVersion: settled.operation.version,
          authority: { kind: "late_evidence", source: "native-proof" },
          replacesReceiptId: settlement.receipt.id,
          reason: "provider cost corrected",
          receipt: {
            ...nativeReceipt(),
            cost: { certainty: "measured", money: { units: 40000n, currency: "USD" } },
          },
        },
        {
          ...f.options,
          acknowledgeCharge: async () => {
            throw new Error("correction must not debit");
          },
        },
      ),
    );
    expect(correction.operation.receipts.at(-1)?.measurements).toContainEqual({
      unit: "budget_cents",
      certainty: "measured",
      quantity: { unit: "budget_cents", value: 30000n, scale: 4 },
    });
    expect(await f.run((tx) => tx.$queryRaw`SELECT * FROM test_wallet_debits`)).toEqual([
      { id: "debit" },
    ]);
  } finally {
    await f.close();
  }
});

test("missing native quantity cannot debit a platform wallet", async () => {
  const f = await paidFixture();
  try {
    const settlement = await platform(f);
    const result = await f.run((tx) =>
      settlePaidAttempt(
        tx,
        { ...settlement, receipt: { ...nativeReceipt(), measurements: [] } },
        {
          ...f.options,
          acknowledgeCharge: async () => {
            throw new Error("missing quantity must not debit");
          },
        },
      ),
    );
    expect(result.operation.state).toBe("pending");
  } finally {
    await f.close();
  }
});

test("wallet callbacks cannot mutate the native proof being acknowledged", async () => {
  const f = await paidFixture();
  try {
    const settlement = await platform(f);
    const result = await f.run((tx) =>
      settlePaidAttempt(tx, settlement, {
        ...f.options,
        acknowledgeCharge: async (_tx, _operation, receipt) => {
          if (settlement.receipt.cost.money) settlement.receipt.cost.money.units = 99999n;
          if (receipt.cost.money) receipt.cost.money.units = 88888n;
          return {
            debitId: "native-debit",
            customerCents: { unit: "customer_cents", value: 30000n, scale: 4 },
          };
        },
      }),
    );
    expect(result.operation.receipts[0]?.cost.money?.units).toBe(20000n);
  } finally {
    await f.close();
  }
});
