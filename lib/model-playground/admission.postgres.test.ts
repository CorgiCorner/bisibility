import {
  createModelRequestJournal,
  recordModelDispatchEvidence,
} from "@/lib/provider-usage/model-request-journal";
import { expect, it } from "vitest";
import { admitModelRun } from "./admission";
import { paymentHarness } from "./admission.postgres.test-support";
import { measuredResult } from "./usage.test-support";

const f = paymentHarness();
it("returns one durable attempt per column on sequential accepted replay", async () => {
  const q = await f.quote(2);
  const results = [await f.admit(q), await f.admit(q)];
  expect(results.map((r) => r.kind)).toEqual(["admitted", "admitted"]);
  expect(results[1]).toMatchObject({ replayed: true });
  expect(await f.count("model_playground_payment_attempts")).toBe(2);
  expect(await f.count("metering_operation")).toBe(2);
  expect(await f.count("metering_usage_evidence")).toBe(2);
});

it.each([
  "prompt",
  "key",
  "disconnect",
  "disabled",
  "budget",
  "actor",
  "catalog",
  "rates",
  "expiry",
] as const)("refuses changed %s and invalidates the quote", async (change) => {
  const q = await f.quote(2);
  if (change === "prompt") f.live().input.prompt = "changed";
  if (change === "key")
    await f.sql.exec(`UPDATE provider_connections SET "credentialsEncrypted"='rotated'`);
  if (change === "disconnect") await f.sql.exec(`DELETE FROM provider_connections`);
  if (change === "disabled") await f.sql.exec(`UPDATE provider_connections SET enabled=false`);
  if (change === "budget") f.live().budget.version++;
  if (change === "actor") await f.sql.exec(`DELETE FROM memberships`);
  if (change === "catalog") f.live().columns[0].catalogRevision = "changed";
  if (change === "rates") f.live().columns[0].binding.rateCard = null;
  const ports = change === "expiry" ? { ...f.ports, now: () => new Date(q.expiresAt) } : f.ports;
  expect(await admitModelRun(f.database, f.consent(q), ports)).toMatchObject({
    kind: "not_dispatched",
    reason: {
      prompt: "configuration_changed",
      key: "credential_changed",
      disconnect: "connection_unavailable",
      disabled: "connection_unavailable",
      budget: "budget_changed",
      actor: "access_denied",
      catalog: "catalog_changed",
      rates: "rate_card_changed",
      expiry: "quote_expired",
    }[change],
    quoteInvalidated: true,
  });
  expect(await f.count("metering_operation")).toBe(0);
  expect(await f.count("model_playground_payment_attempts")).toBe(0);
  expect(await f.admit(q)).toMatchObject({ kind: "not_dispatched", reason: "quote_invalidated" });
});

it.each(["4", "7"])(
  "rolls back every child when the cap %s refuses the first or second",
  async (cap) => {
    const q = await f.quote(2);
    // Actual Store admission must see the cap; resolver still presents the accepted revision.
    await f.sql.query(`UPDATE metering_budget SET body=jsonb_set(body,'{limit,value}',$1::jsonb)`, [
      JSON.stringify({ $bigint: cap }),
    ]);
    expect(await f.admit(q)).toMatchObject({ kind: "not_dispatched", reason: "budget_exhausted" });
    expect(await f.count("metering_operation")).toBe(0);
    expect(await f.count("metering_usage_evidence")).toBe(0);
  },
);

it("fences once, settles tokens with unknown money and accepts a replay after disconnect", async () => {
  const q = await f.quote();
  const admitted = await f.admit(q);
  if (admitted.kind !== "admitted") throw new Error("Missing admission");
  const attempt = admitted.attempts[0];
  const observer = createModelRequestJournal(f.database, f.ports);
  await observer.beforeDispatch(attempt.id);
  await expect(observer.beforeDispatch(attempt.id)).rejects.toThrow("already_dispatched");
  await f.sql.exec(`DELETE FROM provider_connections`);
  const response = { ...measuredResult(), column: attempt.binding.column };
  const settled = await recordModelDispatchEvidence(f.database, attempt.id, response, f.now);
  expect(settled).toMatchObject({
    state: "settled",
    money: { status: "unavailable", total: null },
    automaticPaidRetryAllowed: false,
  });
  await observer.settle(attempt.id, response);
  expect((await f.sql.query(`SELECT body FROM metering_receipt`)).rows).toHaveLength(1);
  expect(
    (await f.sql.query<{ body: { cost: unknown } }>(`SELECT body FROM metering_receipt`)).rows[0]
      .body.cost,
  ).toEqual({ certainty: "unknown", money: null });
  await expect(observer.beforeDispatch(attempt.id)).rejects.toThrow();
});

it("partial observation is terminal for dedup while settlement stays pending", async () => {
  const q = await f.quote();
  const admitted = await f.admit(q);
  if (admitted.kind !== "admitted") throw new Error("Missing admission");
  const attempt = admitted.attempts[0];
  const observer = createModelRequestJournal(f.database, f.ports);
  await observer.beforeDispatch(attempt.id);
  const response = { ...measuredResult(), column: attempt.binding.column };
  response.usage.cacheReadInputTokens = null;
  expect(await recordModelDispatchEvidence(f.database, attempt.id, response, f.now)).toMatchObject({
    state: "unknown",
  });
  await expect(observer.beforeDispatch(attempt.id)).rejects.toThrow("already_dispatched");
  expect(await f.admit(await f.quote())).toMatchObject({
    kind: "admitted",
    quoteId: admitted.quoteId,
    replayed: true,
  });
  expect(await f.count("metering_operation")).toBe(1);
  f.now.setTime(f.now.getTime() + 600001);
  expect(await f.admit(await f.quote())).toMatchObject({ kind: "admitted", replayed: false });
});

it("bounds account dispatch concurrency across columns without granting a repeated paid call", async () => {
  const q = await f.quote(4);
  const admitted = await f.admit(q);
  if (admitted.kind !== "admitted") throw new Error("Missing admission");
  const observer = createModelRequestJournal(f.database, f.ports);
  await Promise.all(admitted.attempts.slice(0, 2).map((a) => observer.beforeDispatch(a.id)));
  await expect(observer.beforeDispatch(admitted.attempts[2].id)).rejects.toThrow(
    "account_concurrency",
  );
  await recordModelDispatchEvidence(f.database, admitted.attempts[0].id, null, f.now);
  await observer.beforeDispatch(admitted.attempts[3].id);
});
