import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import {
  createModelRequestJournal,
  recordModelDispatchEvidence,
} from "@/lib/provider-usage/model-request-journal";
import { expect, it } from "vitest";
import { admitModelRun, saveModelPaymentQuote } from "./admission";
import { paymentHarness } from "./admission.postgres.test-support";
import { createModelPaymentQuote } from "./payment";
import { measuredResult, reportedResult } from "./usage.test-support";

const f = paymentHarness();
async function admitted(count = 1) {
  const q = await f.quote(count);
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Missing admission");
  return result;
}

it("a deduplicated quote remains linked after the content window expires", async () => {
  const first = await admitted();
  const next = await f.quote();
  expect(await f.admit(next)).toMatchObject({
    kind: "admitted",
    quoteId: first.quoteId,
    replayed: true,
  });
  f.now.setTime(f.now.getTime() + 660000);
  expect(await f.admit(next)).toMatchObject({
    kind: "admitted",
    quoteId: first.quoteId,
    replayed: true,
  });
  expect(await f.count("metering_operation")).toBe(1);
});

it.each(["openai", "anthropic", "openrouter", "vercel_ai_gateway"] as const)(
  "kind model on %s never reaches wallet, credit or hosted storage",
  async (provider) => {
    await f.quote();
    const context = f.live();
    context.input.columns[0].providerId = provider;
    const b = context.columns[0].binding;
    b.column.providerId = provider;
    b.credentialVersion = ownCredentialVersion(provider, b.connectionId, "encrypted-fixture") ?? "";
    await f.sql.query(`UPDATE provider_connections SET provider=$1`, [provider]);
    const q = createModelPaymentQuote(context, f.now);
    await saveModelPaymentQuote(f.database, q);
    const result = await f.admit(q);
    if (result.kind !== "admitted") throw new Error("Missing own-key admission");
    const a = result.attempts[0];
    const observer = createModelRequestJournal(f.database, f.ports);
    await observer.beforeDispatch(a.id);
    await observer.settle(a.id, {
      ...measuredResult(),
      column: a.binding.column,
      routingAttemptCredentials: {
        version: 1,
        completeness: "complete",
        attempts: [{ outcome: "succeeded", credentialSource: "gateway_system" }],
      },
    });
    expect(await f.count("metering_operation")).toBe(1);
  },
);
it("requires confirmation of old unresolved dispatches even outside the dedup window", async () => {
  const first = await admitted();
  const attempt = first.attempts[0];
  await createModelRequestJournal(f.database, f.ports).beforeDispatch(attempt.id);
  f.now.setTime(f.now.getTime() + 660000);
  const q = await f.quote();
  expect(await f.admit(q)).toMatchObject({
    kind: "confirmation_required",
    attemptIds: [attempt.id],
  });
  expect(await f.count("metering_operation")).toBe(1);
});

it("acknowledges old uncertainty once while retaining truthful unknown accounting", async () => {
  const first = await admitted();
  const original = first.attempts[0];
  const observer = createModelRequestJournal(f.database, f.ports);
  await observer.beforeDispatch(original.id);
  f.now.setTime(f.now.getTime() + 600001);
  const q = await f.quote();
  const confirmation = await f.admit(q);
  if (confirmation.kind !== "confirmation_required") throw new Error("Missing confirmation");
  const next = await admitModelRun(
    f.database,
    { ...f.consent(q), confirmUnknown: confirmation },
    f.ports,
  );
  if (next.kind !== "admitted") throw new Error("Missing admission");
  await observer.beforeDispatch(next.attempts[0].id);
  await observer.settle(next.attempts[0].id, {
    ...measuredResult(),
    column: next.attempts[0].binding.column,
  });
  expect(await f.admit(await f.quote())).toMatchObject({
    kind: "admitted",
    quoteId: next.quoteId,
    replayed: true,
    earlierAttemptUnconfirmed: true,
  });
});

it("settles a late original receipt after timeout, process loss and disconnect", async () => {
  const result = await admitted();
  const a = result.attempts[0];
  const observer = createModelRequestJournal(f.database, f.ports);
  await observer.beforeDispatch(a.id);
  await recordModelDispatchEvidence(f.database, a.id, null, f.now);
  f.now.setTime(f.now.getTime() + 120000);
  await f.sql.exec(`DELETE FROM provider_connections`);
  expect(
    await recordModelDispatchEvidence(
      f.database,
      a.id,
      { ...reportedResult(), column: a.binding.column },
      f.now,
    ),
  ).toMatchObject({ state: "settled", money: { status: "reported" } });
  await expect(observer.beforeDispatch(a.id)).rejects.toThrow();
});

it("links duplicate native request evidence on the same defined connection without double counting", async () => {
  const result = await admitted(2);
  const observer = createModelRequestJournal(f.database, f.ports);
  for (const a of result.attempts) {
    await observer.beforeDispatch(a.id);
    await observer.settle(a.id, {
      ...measuredResult(),
      column: a.binding.column,
      providerRequestId: "one-native-request",
    });
  }
  const rows = (
    await f.sql.query<{ body: { canonicalOperationId?: string; measurements: unknown[] } }>(
      `SELECT body FROM metering_receipt ORDER BY sequence`,
    )
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows[1].body).toMatchObject({
    canonicalOperationId: result.attempts[0].id,
    measurements: [],
  });
});

it("meters and settles unpriced usage without reserving fabricated money", async () => {
  const q = await f.quote(1, (c) => {
    c.columns[0].binding.rateCard = null;
    c.columns[0].forecast = {
      amount: null,
      currency: "USD",
      certainty: "unknown",
      basis: "unknown",
      rateCardVersion: null,
    };
    c.columns[0].advisory = { cents: "0", basis: "price_unknown" };
  });
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Missing admission");
  const a = result.attempts[0];
  await createModelRequestJournal(f.database, f.ports).beforeDispatch(a.id);
  const state = await recordModelDispatchEvidence(
    f.database,
    a.id,
    { ...measuredResult(), column: a.binding.column },
    f.now,
  );
  expect(state).toMatchObject({ state: "settled", money: { total: null } });
  await f.database.$transaction(async (tx) => {
    const meter = await createTransactionMeter(tx, { now: () => f.now });
    const op = await readPaidOperation(meter, {
      namespace: a.namespace,
      principal: a.principal,
      operationId: a.id,
    });
    expect(op.state).toBe("settled");
    expect(op.estimate.find((q) => q.unit === "budget_cents")?.value).toBe(0n);
    const statuses = await meter.applicableBudgets(
      {
        namespace: a.namespace,
        readablePrincipals: [a.principal],
        readableGroups: [a.binding.projectId],
        readablePools: [],
        canReadBillingDetail: true,
        canManageBudgets: false,
      },
      { scope: op.scope, surface: "app", source: "app", units: ["budget_cents"] },
    );
    if (statuses.outcome !== "ok") throw new Error("Missing budget status");
    expect(statuses.value[0].used?.value ?? 0n).toBe(0n);
  });
});

it.each([
  ["key", "credential_changed"],
  ["role", "access_denied"],
  ["catalog", "catalog_changed"],
  ["output_limit", "catalog_changed"],
] as const)("revalidates %s after admission and before a durable send", async (change, reason) => {
  const result = await admitted();
  if (change === "key")
    await f.sql.exec(`UPDATE provider_connections SET "credentialsEncrypted"='rotated'`);
  if (change === "role") await f.sql.exec(`DELETE FROM memberships`);
  if (change === "catalog") f.live().columns[0].catalogRevision = "new";
  if (change === "output_limit") f.live().columns[0].maxOutputTokens--;
  await expect(
    createModelRequestJournal(f.database, f.ports).beforeDispatch(result.attempts[0].id),
  ).rejects.toMatchObject({ reason });
  const rows = (
    await f.sql.query(`SELECT * FROM metering_paid_attempt_context WHERE fenced_at IS NOT NULL`)
  ).rows;
  expect(rows).toHaveLength(0);
});

it("rejects an observer dispatch or settlement without an admitted attempt", async () => {
  const observer = createModelRequestJournal(f.database, f.ports);
  await expect(observer.beforeDispatch("invented")).rejects.toThrow("Admitted model attempt");
  await expect(
    recordModelDispatchEvidence(f.database, "invented", measuredResult()),
  ).rejects.toThrow("Admitted model attempt");
  expect(await f.count("metering_operation")).toBe(0);
});
