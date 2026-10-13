import { Prisma } from "@/lib/generated/prisma/client";
import { expect, test } from "vitest";
import {
  fencePaidAttemptsInTransaction,
  markPaidAttemptDispatch,
  reservePaidAttempts,
} from "../admission";
import { budget, input, paidFixture, required } from "../paid-attempt-test-fixture";
import { paidContext } from "../paid-context";

test("new fence commits original ISO once and refuses identity/time mutation", async () => {
  const f = await paidFixture();
  f.clock.set("2026-10-01T12:00:00.123Z");
  try {
    await f.store.putBudget(budget("budget_cents", 100n));
    const request = input("new-fence");
    const [reservation] = await f.run((tx) => reservePaidAttempts(tx, [request], f.options));
    const grant = await f.run((tx) =>
      markPaidAttemptDispatch(tx, required(reservation), "worker", f.options),
    );
    await f.run((tx) => fencePaidAttemptsInTransaction(tx, [grant], f.options));
    const ref = { namespace: "test", principal: "owner", operationId: "new-fence" };
    expect(await f.run((tx) => paidContext(tx, ref))).toMatchObject({
      transportFenced: true,
      transportFenceProvenance: "utc_iso_v1",
      transportFenceInstant: "2026-10-01T12:00:00.123Z",
    });
    for (const sql of [
      Prisma.sql`UPDATE metering_paid_attempt_context SET fenced_at=NULL`,
      Prisma.sql`UPDATE metering_paid_attempt_context SET dispatch_lease_id='foreign'`,
      Prisma.sql`UPDATE metering_paid_attempt_context SET fenced_at_iso='2026-10-01T13:00:00.123Z'`,
      Prisma.sql`UPDATE metering_paid_attempt_context SET context=jsonb_set(context,'{providerCredentialVersion}','"foreign"'::jsonb)`,
    ])
      await expect(f.run((tx) => tx.$executeRaw(sql))).rejects.toThrow("immutable");
    await expect(
      f.run(async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone','Europe/Warsaw',true)`;
        await tx.$executeRaw`UPDATE metering_paid_attempt_context SET debit_id='x'`;
      }),
    ).rejects.toThrow("UTC session");
    expect(await f.run((tx) => paidContext(tx, ref))).toMatchObject({
      transportFenceInstant: "2026-10-01T12:00:00.123Z",
    });
    await expect(
      f.run((tx) => fencePaidAttemptsInTransaction(tx, [grant], f.options)),
    ).rejects.toThrow("fenced out");
    // Preserve the existing authorized ledger cleanup contract.
    await expect(
      f.run((tx) => tx.$executeRaw`DELETE FROM metering_paid_attempt_context`),
    ).resolves.toBe(1);
  } finally {
    await f.close();
  }
});
test("new fence cannot claim a mismatched ISO physical instant", async () => {
  const f = await paidFixture();
  try {
    await f.store.putBudget(budget("budget_cents", 100n));
    const [reservation] = await f.run((tx) =>
      reservePaidAttempts(tx, [input("bad-iso")], f.options),
    );
    await f.run((tx) => markPaidAttemptDispatch(tx, required(reservation), "worker", f.options));
    await expect(
      f.run(
        (tx) =>
          tx.$executeRaw`UPDATE metering_paid_attempt_context SET fenced_at='2026-10-01T12:00:00Z',fenced_at_iso='2026-10-01T13:00:00.000Z'`,
      ),
    ).rejects.toThrow("physical instant");
    expect(
      await f.run((tx) =>
        paidContext(tx, { namespace: "test", principal: "owner", operationId: "bad-iso" }),
      ),
    ).toMatchObject({ transportFenced: false, transportFenceProvenance: "none" });
  } finally {
    await f.close();
  }
});

test("already-adopted active reads reject past physical drift after owned guard re-enable", async () => {
  const f = await paidFixture();
  f.clock.set("2026-10-01T12:00:00.123Z");
  try {
    await f.store.putBudget(budget("budget_cents", 100n));
    const [reservation] = await f.run((tx) =>
      reservePaidAttempts(tx, [input("past-drift")], f.options),
    );
    const grant = await f.run((tx) =>
      markPaidAttemptDispatch(tx, required(reservation), "worker", f.options),
    );
    await f.run((tx) => fencePaidAttemptsInTransaction(tx, [grant], f.options));
    const marker = () =>
      f
        .client()
        .$queryRawUnsafe(
          `SELECT value FROM "${f.schema}".metering_metadata WHERE key='bisibility.utc_timestamp_contract'`,
        );
    const before = await marker();
    expect(before).toHaveLength(1);
    // This schema belongs only to this fixture. No shared-schema or production guard bypass.
    await f.client().$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `ALTER TABLE "${f.schema}".metering_paid_attempt_context DISABLE TRIGGER metering_transport_fence`,
      );
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$executeRawUnsafe(
        `UPDATE "${f.schema}".metering_paid_attempt_context SET fenced_at=fenced_at+interval '2 hours' WHERE operation_id='past-drift'`,
      );
      await tx.$executeRawUnsafe(
        `ALTER TABLE "${f.schema}".metering_paid_attempt_context ENABLE TRIGGER metering_transport_fence`,
      );
    });
    expect(await marker()).toEqual(before);
    await expect(
      f.run((tx) =>
        paidContext(tx, { namespace: "test", principal: "owner", operationId: "past-drift" }),
      ),
    ).rejects.toThrow("physical instant");
    const [enabled] = await f
      .client()
      .$queryRawUnsafe<{ state: string }[]>(
        `SELECT t.tgenabled::text AS state FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND t.tgname='metering_transport_fence'`,
        f.schema,
      );
    expect(enabled.state).toBe("O");
  } finally {
    await f.close();
  }
});
