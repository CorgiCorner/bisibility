import { saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { createModelRequestJournal } from "@/lib/provider-usage/model-request-journal";
import { expect, it } from "vitest";
import { admitModelRun } from "./admission";
import { paymentHarness } from "./admission.postgres.test-support";

const f = paymentHarness();

it.each(["all_off", "all", "unknown-setting"])(
  "refuses new reservations when the shared AI switch is %s",
  async (level) => {
    const q = await f.quote();
    await f.sql.query("INSERT INTO instance_settings VALUES('assistant.killSwitch',$1)", [level]);
    expect(await f.admit(q)).toMatchObject({ kind: "not_dispatched", reason: "service_paused" });
    expect(await f.count("metering_operation")).toBe(0);
    expect(await f.count("model_playground_payment_attempts")).toBe(0);
  },
);

it("hosted-off leaves own-key admission and transport working", async () => {
  const q = await f.quote();
  await f.sql.query("INSERT INTO instance_settings VALUES('assistant.killSwitch','hosted_off')");
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Expected own-key admission");
  await createModelRequestJournal(f.database, f.ports).beforeDispatch(result.attempts[0].id);
  const sent = await f.sql.query("SELECT dispatched_at FROM model_playground_payment_attempts");
  expect(sent.rows[0]).toMatchObject({ dispatched_at: expect.any(Date) });
});

it("a switch raised after admission cancels the unsent attempt at the transport fence", async () => {
  const q = await f.quote();
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Expected admission");
  await f.sql.query("INSERT INTO instance_settings VALUES('assistant.killSwitch','all_off')");
  await expect(
    createModelRequestJournal(f.database, f.ports).beforeDispatch(result.attempts[0].id),
  ).rejects.toMatchObject({ reason: "service_paused" });
  const rows = await f.sql.query(
    "SELECT refusal_reason,dispatched_at FROM model_playground_payment_attempts",
  );
  expect(rows.rows).toEqual([{ refusal_reason: "service_paused", dispatched_at: null }]);
});

it("a switch does not rewrite an attempt that already crossed the transport fence", async () => {
  const q = await f.quote();
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Expected admission");
  const journal = createModelRequestJournal(f.database, f.ports);
  await journal.beforeDispatch(result.attempts[0].id);
  await f.sql.query("INSERT INTO instance_settings VALUES('assistant.killSwitch','all_off')");
  await expect(journal.beforeDispatch(result.attempts[0].id)).rejects.toMatchObject({
    reason: "already_dispatched",
  });
  const rows = await f.sql.query("SELECT refusal_reason FROM model_playground_payment_attempts");
  expect(rows.rows).toEqual([{ refusal_reason: null }]);
});
it("accepted replay with altered consent stays uncertain and creates no replacement", async () => {
  const q = await f.quote();
  await f.admit(q);
  // An accepted quote may already have dispatched, so a conflict cannot claim not_dispatched.
  await expect(
    admitModelRun(f.database, { ...f.consent(q), configHash: "a".repeat(64) }, f.ports),
  ).resolves.toEqual({ kind: "uncertain", quoteInvalidated: false });
  expect(await f.count("metering_operation")).toBe(1);
  expect(await f.count("model_playground_payment_attempts")).toBe(1);
  const quoteRows = await f.sql.query(
    "SELECT rejection FROM model_playground_payment_quotes WHERE id=$1",
    [q.quoteId],
  );
  expect(quoteRows.rows).toEqual([{ rejection: null }]);
});
it("rejects a forged consent hash or missing consent without any reservations", async () => {
  const quote = await f.quote();
  expect(
    await admitModelRun(f.database, { ...f.consent(quote), configHash: "a".repeat(64) }, f.ports),
  ).toMatchObject({ kind: "not_dispatched", reason: "configuration_changed" });
  expect(await f.count("metering_operation")).toBe(0);
  const other = await f.quote();
  expect(
    await admitModelRun(f.database, { ...f.consent(other), consent: undefined } as never, f.ports),
  ).toMatchObject({ kind: "not_dispatched", reason: "consent_required" });
});

it("rechecks the actual Meter budget revision, even if the resolver returned the old revision", async () => {
  const q = await f.quote();
  await f.database.$transaction((tx) =>
    saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
      id: q.context.budget.id,
      version: 2,
      scope: { kind: "group", namespace: q.context.namespace, group: q.context.projectId },
      surface: "any",
      unit: "budget_cents",
      limit: { unit: "budget_cents", value: 100n, scale: 0 },
      onExceed: "block",
      window: { kind: "calendar_month", timezone: "UTC" },
    }),
  );
  expect(await f.admit(q)).toMatchObject({ kind: "not_dispatched", reason: "budget_changed" });
  expect(await f.count("metering_operation")).toBe(0);
});

it("keeps consent and possible-send proof immutable in SQL and rolls back a failed commit", async () => {
  const q = await f.quote();
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Missing admission");
  await expect(
    f.sql.query(`UPDATE model_playground_payment_quotes SET snapshot='{}' WHERE id=$1`, [
      q.quoteId,
    ]),
  ).rejects.toThrow("Immutable model quote");
  const a = result.attempts[0];
  await createModelRequestJournal(f.database, f.ports).beforeDispatch(a.id);
  await expect(
    f.sql.query(`UPDATE model_playground_payment_attempts SET dispatched_at=NULL WHERE id=$1`, [
      a.id,
    ]),
  ).rejects.toThrow("Immutable model attempt");
  const next = await f.quote(1, (c) => {
    c.input.prompt = "Different content";
  });
  // A host write/commit error must propagate as uncertain, never become a definite refusal.
  await expect(
    admitModelRun(f.database, f.consent(next), {
      ...f.ports,
      readCurrent: async () => {
        throw new Error("storage-canary");
      },
    }),
  ).rejects.toThrow("storage-canary");
});

it("enforces the unique content cursor and immutable consumed confirmation and terminal refusal", async () => {
  const q = await f.quote();
  const first = await f.admit(q);
  if (first.kind !== "admitted") throw new Error("Missing admission");
  await expect(
    f.sql.query(
      `INSERT INTO model_playground_payment_content SELECT * FROM model_playground_payment_content`,
    ),
  ).rejects.toThrow("duplicate key");
  await expect(
    f.sql.query(
      `UPDATE model_playground_payment_quotes SET confirmation_key='forged' WHERE id=$1`,
      [q.quoteId],
    ),
  ).rejects.toThrow("Immutable model quote");
  await f.sql.exec(`UPDATE provider_connections SET "credentialsEncrypted"='rotated'`);
  await expect(
    createModelRequestJournal(f.database, f.ports).beforeDispatch(first.attempts[0].id),
  ).rejects.toMatchObject({ reason: "credential_changed" });
  await expect(
    f.sql.query(`UPDATE model_playground_payment_attempts SET refusal_reason=NULL WHERE id=$1`, [
      first.attempts[0].id,
    ]),
  ).rejects.toThrow("Immutable model attempt");
  await expect(
    f.sql.query(`UPDATE model_playground_payment_attempts SET dispatched_at=now() WHERE id=$1`, [
      first.attempts[0].id,
    ]),
  ).rejects.toThrow();
});

it("uses the legacy Playground project permission and refuses a read-only project", async () => {
  const q = await f.quote();
  await f.sql.exec(`UPDATE projects SET "writeMode"='migration_hold'`);
  expect(await f.admit(q)).toMatchObject({ kind: "not_dispatched", reason: "access_denied" });
});

it("uses the admission clock for reservation lifetime and makes expiry a terminal no-send refusal", async () => {
  const q = await f.quote();
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Missing admission");
  const [a] = result.attempts;
  const operation = (
    await f.sql.query<{ reservation_expires_at: Date }>(
      `SELECT reservation_expires_at FROM metering_operation WHERE operation_id=$1`,
      [a.id],
    )
  ).rows[0];
  expect(operation.reservation_expires_at.getTime()).toBe(f.now.getTime() + 86400000);
  f.now.setTime(f.now.getTime() + 86400001);
  const observer = createModelRequestJournal(f.database, f.ports);
  await expect(observer.beforeDispatch(a.id)).rejects.toMatchObject({
    reason: "reservation_unavailable",
  });
  expect(
    (await f.sql.query(`SELECT state FROM metering_operation WHERE operation_id=$1`, [a.id])).rows,
  ).toEqual([{ state: "released" }]);
  expect(
    (
      await f.sql.query(
        `SELECT refusal_reason,dispatched_at FROM model_playground_payment_attempts WHERE id=$1`,
        [a.id],
      )
    ).rows,
  ).toEqual([{ refusal_reason: "reservation_unavailable", dispatched_at: null }]);
  await expect(observer.beforeDispatch(a.id)).rejects.toMatchObject({
    reason: "reservation_unavailable",
  });
});
