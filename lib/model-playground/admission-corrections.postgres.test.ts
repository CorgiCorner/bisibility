import * as capabilities from "@/lib/auth/capabilities";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { createModelRequestJournal } from "@/lib/provider-usage/model-request-journal";
import { expect, it, vi } from "vitest";
import { admitModelRun } from "./admission";
import { paymentHarness } from "./admission.postgres.test-support";
import { readModelAttempts } from "./admission-storage";
import { measuredResult } from "./usage.test-support";

const f = paymentHarness();
it.each([false, true])(
  "consumes a confirmation once with fresh quote=%s (serialized SQL)",
  async (fresh) => {
    const original = await f.admit(await f.quote(2));
    if (original.kind !== "admitted") throw new Error("Missing admission");
    const observer = createModelRequestJournal(f.database, f.ports);
    for (const a of original.attempts) await observer.beforeDispatch(a.id);
    f.now.setTime(f.now.getTime() + 600001);
    const q = await f.quote(2);
    const confirmation = await f.admit(q);
    if (confirmation.kind !== "confirmation_required") throw new Error("Missing confirmation");
    const input = {
      ...f.consent(q),
      confirmUnknown: { ...confirmation, attemptIds: [...confirmation.attemptIds].reverse() },
    };
    const first = await admitModelRun(f.database, input, f.ports);
    expect(first.kind).toBe("admitted");
    const next = fresh ? await f.quote(2) : q;
    expect(
      await admitModelRun(f.database, { ...input, ...f.consent(next) }, f.ports),
    ).toMatchObject({
      kind: "admitted",
      replayed: true,
      quoteId: first.kind === "admitted" ? first.quoteId : "missing",
    });
    expect(await f.count("model_playground_payment_attempts")).toBe(4);
    // Consumption remains durable beyond the content window and after a process reconnect.
    f.now.setTime(f.now.getTime() + 660000);
    const later = await f.quote(2);
    expect(
      await admitModelRun(f.database, { ...input, ...f.consent(later) }, f.ports),
    ).toMatchObject({ kind: "admitted", replayed: true });
    expect(await f.count("metering_operation")).toBe(4);
  },
);

it("commits terminal refusal and releases budget before a rotated-key run", async () => {
  const q = await f.quote(2);
  await f.sql.query(`UPDATE metering_budget SET body=jsonb_set(body,'{limit,value}',$1::jsonb)`, [
    JSON.stringify({ $bigint: "10" }),
  ]);
  const original = await f.admit(q);
  if (original.kind !== "admitted") throw new Error("Missing admission");
  await f.sql.exec(`UPDATE provider_connections SET "credentialsEncrypted"='rotated'`);
  const observer = createModelRequestJournal(f.database, f.ports);
  for (const a of original.attempts) {
    await expect(observer.beforeDispatch(a.id)).rejects.toMatchObject({
      reason: "credential_changed",
    });
    await f.database.$transaction(async (tx) => {
      expect(
        (
          await readPaidOperation(await createTransactionMeter(tx, { now: () => f.now }), {
            namespace: a.namespace,
            principal: a.principal,
            operationId: a.id,
          })
        ).state,
      ).toBe("released");
      expect((await readModelAttempts(tx, q.quoteId)).find((v) => v.id === a.id)).toMatchObject({
        state: "refused",
        refusalReason: "credential_changed",
      });
    });
  }
  const next = await f.quote(2, (c) => {
    for (const { binding: b } of c.columns)
      b.credentialVersion =
        ownCredentialVersion(b.column.providerId, b.connectionId, "rotated") ?? "";
  });
  const accepted = await f.admit(next);
  expect(accepted).toMatchObject({ kind: "admitted", quoteId: original.quoteId, replayed: false });
  if (accepted.kind !== "admitted") throw new Error("Missing fresh admission");
  await observer.beforeDispatch(accepted.attempts[0].id);
  await expect(observer.beforeDispatch(original.attempts[0].id)).rejects.toMatchObject({
    reason: "credential_changed",
  });
});

it("busy leaves the reservation admitted; only the in-flight bound frees slots", async () => {
  const q = await f.quote(4);
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Missing admission");
  const observer = createModelRequestJournal(f.database, f.ports);
  await observer.beforeDispatch(result.attempts[0].id);
  await observer.beforeDispatch(result.attempts[1].id);
  await expect(observer.beforeDispatch(result.attempts[2].id)).rejects.toMatchObject({
    reason: "account_concurrency",
  });
  await f.database.$transaction(async (tx) => {
    expect((await readModelAttempts(tx, q.quoteId, f.now))[2]).toMatchObject({
      state: "admitted",
      refusalReason: null,
    });
    expect(
      (
        await readPaidOperation(await createTransactionMeter(tx, { now: () => f.now }), {
          namespace: result.attempts[2].namespace,
          principal: result.attempts[2].principal,
          operationId: result.attempts[2].id,
        })
      ).state,
    ).toBe("reserved");
  });
  f.now.setTime(f.now.getTime() + 60001);
  await expect(observer.beforeDispatch(result.attempts[2].id)).rejects.toMatchObject({
    reason: "account_concurrency",
  });
  f.now.setTime(f.now.getTime() + 90000);
  await observer.beforeDispatch(result.attempts[2].id);
  await expect(observer.beforeDispatch(result.attempts[0].id)).rejects.toMatchObject({
    reason: "already_dispatched",
  });
  expect(
    (await f.database.$transaction((tx) => readModelAttempts(tx, q.quoteId, f.now)))[0],
  ).toMatchObject({ state: "stale_unknown", observed: false });
});

it.each(["configuration_changed", "consent_required", "access_denied"] as const)(
  "preserves uncertainty for %s on accepted replay",
  async (reason) => {
    const q = await f.quote();
    await f.admit(q);
    const input = f.consent(q);
    if (reason === "configuration_changed") input.configHash = "changed";
    if (reason === "consent_required") Object.assign(input, { consent: "missing" });
    if (reason === "access_denied") await f.sql.exec(`DELETE FROM memberships`);
    expect(await admitModelRun(f.database, input, f.ports)).toMatchObject({
      kind: "uncertain",
      quoteInvalidated: false,
    });
  },
);

it("maps every new column id to one existing attempt, including identical duplicate columns", async () => {
  const original = await f.admit(await f.quote(2));
  if (original.kind !== "admitted") throw new Error("Missing admission");
  const q = await f.quote(2);
  const replay = await f.admit(q);
  expect(replay).toMatchObject({ kind: "admitted", replayed: true });
  if (replay.kind !== "admitted") throw new Error("Missing replay");
  const mapping = (replay as typeof replay & { columnAttempts: Record<string, string> })
    .columnAttempts;
  expect(Object.keys(mapping).sort()).toEqual(
    q.context.input.columns.map((c) => c.columnId).sort(),
  );
  expect(Object.values(mapping).sort()).toEqual(original.attempts.map((a) => a.id).sort());
});

it("compares confirmation ids as a set regardless of database collation order", async () => {
  const first = await f.admit(await f.quote(2));
  if (first.kind !== "admitted") throw new Error("Missing admission");
  for (const a of first.attempts)
    await createModelRequestJournal(f.database, f.ports).beforeDispatch(a.id);
  f.now.setTime(f.now.getTime() + 600001);
  const q = await f.quote(2);
  const confirmation = await f.admit(q);
  if (confirmation.kind !== "confirmation_required") throw new Error("Missing confirmation");
  let fired = false;
  const database = {
    $transaction: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
      f.database.$transaction((tx) =>
        body(
          new Proxy(tx, {
            get(target, property) {
              if (property !== "$queryRaw") return Reflect.get(target, property);
              return async (...args: unknown[]) => {
                const rows = await (
                  target.$queryRaw as (...values: unknown[]) => Promise<{ id: string }[]>
                )(...args);
                const text = String(args[0]);
                if (text.includes("a.observed_at IS NULL ORDER BY a.id")) {
                  fired = true;
                  return [...rows].sort((a, b) => (a.id < b.id ? 1 : -1));
                }
                return rows;
              };
            },
          }),
        ),
      ),
  } as typeof f.database;
  expect(
    await admitModelRun(database, { ...f.consent(q), confirmUnknown: confirmation }, f.ports),
  ).toMatchObject({ kind: "admitted", replayed: false });
  expect(fired).toBe(true);
});

it("requires the shared AI capability for Playground admission", async () => {
  const spy = vi.spyOn(capabilities, "hasProjectCapability");
  try {
    const q = await f.quote();
    await f.admit(q);
    expect(spy).toHaveBeenCalledWith("member", "assistant.use");
  } finally {
    spy.mockRestore();
  }
});

it("replays a live root across internal connection changes", async () => {
  const first = await f.admit(await f.quote());
  expect(first.kind).toBe("admitted");
  await f.sql.exec(`UPDATE provider_connections SET id='replacement-connection'`);
  const q = await f.quote(1, (c) => {
    const b = c.columns[0].binding;
    b.connectionId = "replacement-connection";
    b.credentialVersion =
      ownCredentialVersion(b.column.providerId, b.connectionId, "encrypted-fixture") ?? "";
  });
  const next = await f.admit(q);
  expect(next).toMatchObject({
    kind: "admitted",
    quoteId: first.kind === "admitted" ? first.quoteId : "missing",
    replayed: true,
  });
  expect(await f.count("metering_operation")).toBe(1);
});

it("replays a resolved run when its unused uncertainty confirmation is stale", async () => {
  const first = await f.admit(await f.quote());
  if (first.kind !== "admitted") throw new Error("Missing admission");
  const a = first.attempts[0];
  const observer = createModelRequestJournal(f.database, f.ports);
  await observer.beforeDispatch(a.id);
  await observer.settle(a.id, { ...measuredResult(), column: a.binding.column });
  const q = await f.quote();
  expect(
    await admitModelRun(
      f.database,
      {
        ...f.consent(q),
        confirmUnknown: { nonce: "unused", contentHash: q.contentHash, attemptIds: [a.id] },
      },
      f.ports,
    ),
  ).toMatchObject({ kind: "admitted", quoteId: first.quoteId, replayed: true });
  expect(await f.count("metering_operation")).toBe(1);
});
