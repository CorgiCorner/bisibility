import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import {
  createModelRequestJournal,
  recordModelDispatchEvidence,
} from "@/lib/provider-usage/model-request-journal";
import { expect, it } from "vitest";
import { admitModelRun } from "./admission";
import { paymentHarness } from "./admission.postgres.test-support";
import { readModelAttempts } from "./admission-storage";
import { measuredResult } from "./usage.test-support";

const f = paymentHarness();
const journal = () => createModelRequestJournal(f.database, f.ports);
async function start(count = 1) {
  const run = await f.admit(await f.quote(count));
  if (run.kind !== "admitted") throw new Error("Missing admission");
  return run;
}
async function observe(a: Awaited<ReturnType<typeof start>>["attempts"][number]) {
  return recordModelDispatchEvidence(
    f.database,
    a.id,
    { ...measuredResult(), column: a.binding.column, providerRequestId: `request:${a.id}` },
    f.now,
  );
}
async function closeWindow() {
  f.now.setTime(f.now.getTime() + 600_001);
}

it("finding 1: two columns, one busy, one settled, retry never buys the settled column", async () => {
  const external = await f.admit(
    await f.quote(1, (c) => {
      c.input.prompt = "Other run";
    }),
  );
  if (external.kind !== "admitted") throw new Error("Missing external slot holder");
  await journal().beforeDispatch(external.attempts[0].id);
  const run = await start(2);
  const originalContext = f.live();
  const o = createModelRequestJournal(f.database, {
    ...f.ports,
    readCurrent: async () => originalContext,
  });
  await o.beforeDispatch(run.attempts[0].id);
  await expect(o.beforeDispatch(run.attempts[1].id)).rejects.toMatchObject({
    reason: "account_concurrency",
    retryable: true,
  });
  await observe(run.attempts[0]);
  expect(await f.admit(await f.quote(2))).toMatchObject({
    kind: "admitted",
    quoteId: run.quoteId,
    replayed: true,
  });
  await o.beforeDispatch(run.attempts[1].id);
  expect(await f.count("metering_operation")).toBe(3);
});

it("finding 4: a queued root older than the window remains live", async () => {
  const run = await start();
  await closeWindow();
  expect(await f.admit(await f.quote())).toMatchObject({
    kind: "admitted",
    quoteId: run.quoteId,
    replayed: true,
  });
  expect(await f.count("metering_operation")).toBe(1);
});

it("R4: a changed internal connection cannot replace an admitted live column", async () => {
  const run = await start();
  await f.sql.exec(`UPDATE provider_connections SET id='replacement'`);
  const q = await f.quote(1, (c) => {
    const b = c.columns[0].binding;
    b.connectionId = "replacement";
    b.credentialVersion =
      ownCredentialVersion(b.column.providerId, b.connectionId, "encrypted-fixture") ?? "";
  });
  expect(await f.admit(q)).toMatchObject({
    kind: "admitted",
    quoteId: run.quoteId,
    replayed: true,
  });
  expect(await f.count("metering_operation")).toBe(1);
});

it("lease expiry never frees a still in-flight slot; the transport bound does", async () => {
  const run = await start(4);
  const o = journal();
  await o.beforeDispatch(run.attempts[0].id);
  await o.beforeDispatch(run.attempts[1].id);
  f.now.setTime(f.now.getTime() + 60_001);
  await expect(o.beforeDispatch(run.attempts[2].id)).rejects.toMatchObject({
    reason: "account_concurrency",
  });
  expect(
    await f.database.$transaction((tx) => readModelAttempts(tx, run.quoteId, f.now)),
  ).toMatchObject([
    { state: "in_flight" },
    { state: "in_flight" },
    { state: "admitted" },
    { state: "admitted" },
  ]);
  f.now.setTime(f.now.getTime() + 90_000);
  await o.beforeDispatch(run.attempts[2].id);
  await expect(o.beforeDispatch(run.attempts[0].id)).rejects.toMatchObject({
    reason: "already_dispatched",
  });
});

it("late observation invalidates an unused nonce and R2 proceeds when no stale unknown remains", async () => {
  const run = await start();
  const a = run.attempts[0];
  await journal().beforeDispatch(a.id);
  await closeWindow();
  const q = await f.quote();
  const confirmation = await f.admit(q);
  expect(confirmation).toMatchObject({
    kind: "confirmation_required",
    nonce: expect.any(String),
    attemptIds: [a.id],
  });
  if (confirmation.kind !== "confirmation_required") throw new Error("Missing confirmation");
  await observe(a);
  const result = await admitModelRun(
    f.database,
    { ...f.consent(q), confirmUnknown: confirmation },
    f.ports,
  );
  expect(result).toMatchObject({ kind: "admitted", replayed: false });
  expect(
    await f.database.$transaction((tx) => readModelAttempts(tx, run.quoteId, f.now)),
  ).toMatchObject([{ state: "observed" }]);
});

it("a partial late receipt refreshes the nonce to exactly the remaining stale unknown set", async () => {
  const run = await start(2);
  for (const a of run.attempts) await journal().beforeDispatch(a.id);
  await closeWindow();
  const q = await f.quote(2);
  const confirmation = await f.admit(q);
  if (confirmation.kind !== "confirmation_required") throw new Error("Missing confirmation");
  await observe(run.attempts[0]);
  const result = await admitModelRun(
    f.database,
    { ...f.consent(q), confirmUnknown: confirmation },
    f.ports,
  );
  expect(result).toMatchObject({ kind: "confirmation_required", attemptIds: [run.attempts[1].id] });
  if (result.kind !== "confirmation_required") throw new Error("Missing refreshed confirmation");
  expect(result.nonce).not.toBe(confirmation.nonce);
  expect(await f.count("metering_operation")).toBe(2);
});

it("mixed root after key rotation replaces only its refused column, atomically", async () => {
  const run = await start(3);
  const o = journal();
  await o.beforeDispatch(run.attempts[0].id);
  await observe(run.attempts[0]);
  await f.sql.exec(`UPDATE provider_connections SET "credentialsEncrypted"='rotated'`);
  for (const a of run.attempts.slice(1))
    await expect(o.beforeDispatch(a.id)).rejects.toMatchObject({ reason: "credential_changed" });
  const next = () =>
    f.quote(3, (c) => {
      for (const { binding: b } of c.columns)
        b.credentialVersion =
          ownCredentialVersion(b.column.providerId, b.connectionId, "rotated") ?? "";
    });
  const stale = await next();
  f.live().budget.version++;
  expect(await f.admit(stale)).toMatchObject({
    kind: "admitted",
    quoteId: run.quoteId,
    replacementRefusal: { reason: "budget_changed", quoteInvalidated: true },
  });
  expect(await f.count("metering_operation")).toBe(3);
  // Failure of the second replacement rolls back the first, leaving both refused children.
  await f.sql.query(`UPDATE metering_budget SET body=jsonb_set(body,'{limit,value}',$1::jsonb)`, [
    JSON.stringify({ $bigint: "7" }),
  ]);
  expect(await f.admit(await next())).toMatchObject({
    kind: "admitted",
    quoteId: run.quoteId,
    replacementRefusal: { reason: "budget_exhausted", quoteInvalidated: true },
  });
  expect(await f.count("metering_operation")).toBe(3);
  await f.sql.query(`UPDATE metering_budget SET body=jsonb_set(body,'{limit,value}',$1::jsonb)`, [
    JSON.stringify({ $bigint: "100" }),
  ]);
  const q = await next();
  const recovered = await f.admit(q);
  expect(recovered).toMatchObject({ kind: "admitted", quoteId: run.quoteId, replayed: false });
  if (recovered.kind !== "admitted") throw new Error("Missing replacement admission");
  expect(recovered.attempts.filter((a) => a.id === run.attempts[0].id)).toHaveLength(1);
  expect(recovered.attempts.filter((a) => a.state === "admitted")).toHaveLength(2);
  expect(await f.count("metering_operation")).toBe(5);
  for (const a of recovered.attempts.filter((a) => a.state === "admitted"))
    await journal().beforeDispatch(a.id);
  expect(await f.admit(await next())).toMatchObject({
    kind: "admitted",
    quoteId: run.quoteId,
    replayed: true,
  });
  expect(await f.count("metering_operation")).toBe(5);
});

it.each(["refusal", "key_rotation", "settled"] as const)(
  "finding 2 %s: a consumed nonce never traps the content",
  async (change) => {
    const first = await start();
    await journal().beforeDispatch(first.attempts[0].id);
    await closeWindow();
    const q = await f.quote();
    const confirmation = await f.admit(q);
    if (confirmation.kind !== "confirmation_required") throw new Error("Missing confirmation");
    const next = await admitModelRun(
      f.database,
      { ...f.consent(q), confirmUnknown: confirmation },
      f.ports,
    );
    if (next.kind !== "admitted") throw new Error("Missing confirmed root");
    const a = next.attempts[0];
    if (change === "settled") {
      await journal().beforeDispatch(a.id);
      await observe(a);
    } else {
      if (change === "key_rotation")
        await f.sql.exec(`UPDATE provider_connections SET "credentialsEncrypted"='rotated'`);
      else f.live().columns[0].catalogRevision = "new-catalog";
      await expect(journal().beforeDispatch(a.id)).rejects.toMatchObject({
        reason: change === "key_rotation" ? "credential_changed" : "catalog_changed",
      });
      const fresh = await f.quote(1, (c) => {
        if (change === "key_rotation") {
          const b = c.columns[0].binding;
          b.credentialVersion =
            ownCredentialVersion(b.column.providerId, b.connectionId, "rotated") ?? "";
        }
      });
      const recovered = await admitModelRun(
        f.database,
        { ...f.consent(fresh), confirmUnknown: confirmation },
        f.ports,
      );
      expect(recovered).toMatchObject({ kind: "admitted", quoteId: next.quoteId, replayed: false });
      if (recovered.kind !== "admitted") throw new Error("Missing recovered root");
      await journal().beforeDispatch(recovered.attempts[0].id);
      await observe(recovered.attempts[0]);
    }
    await closeWindow();
    const spent = await f.quote(1, (c) => {
      if (change === "key_rotation") {
        const b = c.columns[0].binding;
        b.credentialVersion =
          ownCredentialVersion(b.column.providerId, b.connectionId, "rotated") ?? "";
      }
    });
    expect(
      await admitModelRun(
        f.database,
        { ...f.consent(spent), confirmUnknown: confirmation },
        f.ports,
      ),
    ).toMatchObject({ kind: "not_dispatched", reason: "confirmation_spent" });
    const fresh = await f.quote(1, (c) => {
      if (change === "key_rotation") {
        const b = c.columns[0].binding;
        b.credentialVersion =
          ownCredentialVersion(b.column.providerId, b.connectionId, "rotated") ?? "";
      }
    });
    expect(await f.admit(fresh)).toMatchObject({ kind: "admitted", replayed: false });
    const original = await f.database.$transaction((tx) =>
      readModelAttempts(tx, first.quoteId, f.now),
    );
    expect(original[0].state).toBe("acknowledged_unknown");
    await f.sql.exec(`DELETE FROM provider_connections`);
    expect(await observe(first.attempts[0])).toMatchObject({ state: "settled" });
    expect(
      (await f.database.$transaction((tx) => readModelAttempts(tx, first.quoteId, f.now)))[0].state,
    ).toBe("observed");
  },
);
