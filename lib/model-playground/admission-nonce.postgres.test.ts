import {
  createModelRequestJournal,
  recordModelDispatchEvidence,
} from "@/lib/provider-usage/model-request-journal";
import { afterEach, expect, it, vi } from "vitest";
import { admitModelRun } from "./admission";
import { paymentHarness } from "./admission.postgres.test-support";
import {
  consumeModelConfirmation,
  issueModelConfirmation,
  modelRoot,
} from "./admission-confirmation";
import { MODEL_IN_FLIGHT_MS } from "./admission-state";
import { readModelAttempt } from "./admission-storage";
import { measuredResult } from "./usage.test-support";

const f = paymentHarness();
async function unknown() {
  const q = await f.quote();
  const run = await f.admit(q);
  if (run.kind !== "admitted") throw new Error("Missing admission");
  await createModelRequestJournal(f.database, f.ports).beforeDispatch(run.attempts[0].id);
  f.now.setTime(f.now.getTime() + 600001);
  const next = await f.quote();
  const confirmation = await f.admit(next);
  if (confirmation.kind !== "confirmation_required") throw new Error("Missing confirmation");
  return { a: run.attempts[0], next, confirmation };
}

it("a nonce is consumed atomically with all reservations and acknowledgements", async () => {
  const { a, next, confirmation } = await unknown();
  await f.sql.query(`UPDATE metering_budget SET body=jsonb_set(body,'{limit,value}',$1::jsonb)`, [
    JSON.stringify({ $bigint: "5" }),
  ]);
  expect(
    await admitModelRun(f.database, { ...f.consent(next), confirmUnknown: confirmation }, f.ports),
  ).toMatchObject({ kind: "not_dispatched", reason: "budget_exhausted" });
  expect(
    (await f.sql.query(`SELECT consumed_at FROM model_playground_payment_confirmations`)).rows,
  ).toEqual([{ consumed_at: null }]);
  expect((await f.database.$transaction((tx) => readModelAttempt(tx, a.id, f.now))).state).toBe(
    "stale_unknown",
  );
  expect(await f.count("metering_operation")).toBe(1);
  await f.sql.query(`UPDATE metering_budget SET body=jsonb_set(body,'{limit,value}',$1::jsonb)`, [
    JSON.stringify({ $bigint: "100" }),
  ]);
  const q = await f.quote();
  expect(
    await admitModelRun(f.database, { ...f.consent(q), confirmUnknown: confirmation }, f.ports),
  ).toMatchObject({ kind: "admitted", replayed: false });
  expect((await f.database.$transaction((tx) => readModelAttempt(tx, a.id, f.now))).state).toBe(
    "acknowledged_unknown",
  );
  expect(await f.count("metering_operation")).toBe(2);
  await expect(
    f.sql.exec(
      `UPDATE model_playground_payment_confirmations SET consumed_at=NULL,consumed_root_quote_id=NULL`,
    ),
  ).rejects.toThrow("Immutable model confirmation");
});

it.each(["nonce", "attempts", "content", "actor", "project"] as const)(
  "a forged %s never acknowledges an unknown paid attempt",
  async (field) => {
    const { a, next, confirmation } = await unknown();
    const forged = structuredClone(confirmation);
    if (field === "nonce") forged.nonce = crypto.randomUUID();
    if (field === "attempts") forged.attemptIds = ["other-attempt"];
    if (field === "content") forged.contentHash = "f".repeat(64);
    if (field === "actor" || field === "project") {
      forged.nonce = crypto.randomUUID();
      await f.sql.query(
        `INSERT INTO model_playground_payment_confirmations(nonce,project_id,actor_id,content_hash,attempt_ids,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
        [
          forged.nonce,
          field === "project" ? "other-project" : next.context.projectId,
          field === "actor" ? "other-actor" : next.context.actorId,
          next.contentHash,
          JSON.stringify([a.id]),
          f.now,
        ],
      );
    }
    expect(
      await admitModelRun(f.database, { ...f.consent(next), confirmUnknown: forged }, f.ports),
    ).toMatchObject({ kind: "confirmation_required", attemptIds: [a.id] });
    expect((await f.database.$transaction((tx) => readModelAttempt(tx, a.id, f.now))).state).toBe(
      "stale_unknown",
    );
    expect(await f.count("metering_operation")).toBe(1);
  },
);

it("a dispatch near window expiry keeps the root live through its full in-flight bound", async () => {
  const q = await f.quote();
  const run = await f.admit(q);
  if (run.kind !== "admitted") throw new Error("Missing admission");
  const original = f.live();
  f.now.setTime(f.now.getTime() + 599999);
  await createModelRequestJournal(f.database, {
    ...f.ports,
    readCurrent: async () => original,
  }).beforeDispatch(run.attempts[0].id);
  f.now.setTime(f.now.getTime() + MODEL_IN_FLIGHT_MS - 1);
  expect(await f.admit(await f.quote())).toMatchObject({
    kind: "admitted",
    quoteId: run.quoteId,
    replayed: true,
  });
  f.now.setTime(f.now.getTime() + 1);
  expect(await f.admit(await f.quote())).toMatchObject({
    kind: "confirmation_required",
    attemptIds: [run.attempts[0].id],
  });
});

it("observation wins over an unused nonce even when its native usage remains partial", async () => {
  const { a, next, confirmation } = await unknown();
  const response = { ...measuredResult(), column: a.binding.column };
  response.usage.cacheReadInputTokens = null;
  expect(await recordModelDispatchEvidence(f.database, a.id, response, f.now)).toMatchObject({
    state: "unknown",
  });
  expect(
    await admitModelRun(f.database, { ...f.consent(next), confirmUnknown: confirmation }, f.ports),
  ).toMatchObject({ kind: "admitted", replayed: false });
  expect((await f.database.$transaction((tx) => readModelAttempt(tx, a.id, f.now))).state).toBe(
    "observed",
  );
});

// Quote: unaccepted -> admission planning; accepted -> saved replay or uncertainty.
// Accepted sees confirmation none/unconsumed/own-root/other-root, each live/dead.
// Only a dead other-root consumption refuses replay. No accepted state invalidates a quote.
// A linked quote uses replay_of as its own root; consuming a fresh nonce stores quoteId.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(
  [false, true].flatMap((linked) =>
    ["none", "unconsumed", "own root", "other root"].flatMap((confirmation) =>
      [true, false].map((live) => ({ linked, confirmation, live })),
    ),
  ),
)(
  "accepted linked=$linked confirmation=$confirmation live=$live never readmits",
  async ({ linked, confirmation, live }) => {
    const root = await f.quote();
    const saved = await f.admit(root);
    if (saved.kind !== "admitted") throw new Error("Missing saved admission");
    const journal = createModelRequestJournal(f.database, f.ports);
    await journal.beforeDispatch(saved.attempts[0].id);
    const q = linked ? await f.quote() : root;
    if (linked) expect(await f.admit(q)).toMatchObject({ quoteId: root.quoteId, replayed: true });
    const other = confirmation === "other root" ? await f.quote() : null;
    if (other)
      await f.sql.query("UPDATE model_playground_payment_quotes SET accepted_at=$1 WHERE id=$2", [
        f.now,
        other.quoteId,
      ]);
    const input: import("./admission").ModelRunConsent = f.consent(q);
    if (confirmation !== "none")
      input.confirmUnknown = await f.database.$transaction(async (tx) => {
        const issued = await issueModelConfirmation(tx, q, [saved.attempts[0].id], f.now);
        if (confirmation !== "unconsumed")
          await consumeModelConfirmation(tx, issued.nonce, other?.quoteId ?? root.quoteId, f.now);
        return issued;
      });
    if (!live) f.now.setTime(+f.now + 700000);
    expect(
      (await f.database.$transaction((tx) => modelRoot(tx, other?.quoteId ?? root.quoteId, f.now)))
        .live,
    ).toBe(live);
    const before = (
      await f.sql.query("SELECT * FROM model_playground_payment_attempts ORDER BY id")
    ).rows;
    const operations = await f.count("metering_operation");
    const reserve = (await f.sql.query("SELECT * FROM metering_operation ORDER BY operation_id"))
      .rows;
    f.statements.length = 0;
    const outcome = await admitModelRun(f.database, input, f.ports);
    if (confirmation === "other root" && !live)
      expect(outcome).toEqual({ kind: "uncertain", quoteInvalidated: false });
    else
      expect(outcome).toMatchObject({
        kind: "admitted",
        quoteId: root.quoteId,
        replayed: true,
        columnAttempts: { [q.context.columns[0].binding.column.columnId]: saved.attempts[0].id },
        attempts: [{ id: saved.attempts[0].id, dispatched: true }],
      });
    expect(
      (await f.sql.query("SELECT * FROM model_playground_payment_attempts ORDER BY id")).rows,
    ).toEqual(before);
    expect(
      (await f.sql.query("SELECT * FROM metering_operation ORDER BY operation_id")).rows,
    ).toEqual(reserve);
    expect(await f.count("metering_operation")).toBe(operations);
    expect(
      f.statements.some((sql) =>
        /INSERT INTO (model_playground_payment_attempts|metering_)/i.test(sql),
      ),
    ).toBe(false);
    expect(
      (
        await f.sql.query("SELECT rejection FROM model_playground_payment_quotes WHERE id=$1", [
          q.quoteId,
        ])
      ).rows,
    ).toEqual([{ rejection: null }]);
    await expect(journal.beforeDispatch(saved.attempts[0].id)).rejects.toMatchObject({
      reason: "already_dispatched",
    });
    expect(
      (await f.sql.query("SELECT * FROM model_playground_payment_attempts ORDER BY id")).rows,
    ).toEqual(before);
    if (input.confirmUnknown)
      expect(
        (
          await f.sql.query(
            "SELECT consumed_root_quote_id FROM model_playground_payment_confirmations WHERE nonce=$1",
            [input.confirmUnknown.nonce],
          )
        ).rows,
      ).toEqual([
        {
          consumed_root_quote_id:
            confirmation === "unconsumed" ? null : (other?.quoteId ?? root.quoteId),
        },
      ]);
  },
);
