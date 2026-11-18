import {
  createModelRequestJournal,
  recordModelDispatchEvidence,
} from "@/lib/provider-usage/model-request-journal";
import { expect, it } from "vitest";
import { admitModelRun } from "./admission";
import { paymentHarness } from "./admission.postgres.test-support";
import { MODEL_IN_FLIGHT_MS, type ModelAttemptState, modelRootIsLive } from "./admission-state";
import { readModelAttempt, readModelAttempts } from "./admission-storage";
import { events, next, states } from "./admission-transitions.test-support";
import { measuredResult } from "./usage.test-support";

const f = paymentHarness();

async function start(state: ModelAttemptState, event: (typeof events)[number]) {
  let quote = await f.quote();
  let run = await f.admit(quote);
  let suppliedNonce: { nonce: string; contentHash: string; attemptIds: string[] } | undefined;
  let priorOperations = 0;
  if (event === "nonce" || event === "spent_nonce") {
    if (run.kind !== "admitted") throw new Error("Missing predecessor");
    await createModelRequestJournal(f.database, f.ports).beforeDispatch(run.attempts[0].id);
    f.now.setTime(f.now.getTime() + 600001);
    quote = await f.quote();
    const consumed = await f.admit(quote);
    const unused = await f.admit(quote);
    if (consumed.kind !== "confirmation_required" || unused.kind !== "confirmation_required")
      throw new Error("Missing server nonces");
    run = await admitModelRun(
      f.database,
      { ...f.consent(quote), confirmUnknown: consumed },
      f.ports,
    );
    suppliedNonce = event === "nonce" ? unused : consumed;
    priorOperations = 1;
  }
  if (run.kind !== "admitted") throw new Error("Missing initial root");
  const a = run.attempts[0];
  const context = f.live();
  const observer = createModelRequestJournal(f.database, {
    ...f.ports,
    readCurrent: async () => context,
  });
  let nonce: { nonce: string; contentHash: string; attemptIds: string[] } | undefined;
  if (state === "refused") {
    context.columns[0].catalogRevision = "changed";
    await expect(observer.beforeDispatch(a.id)).rejects.toMatchObject({
      reason: "catalog_changed",
    });
    context.columns[0].catalogRevision = quote.context.columns[0].catalogRevision;
  } else if (state !== "admitted") {
    await observer.beforeDispatch(a.id);
    if (state === "observed")
      await recordModelDispatchEvidence(
        f.database,
        a.id,
        { ...measuredResult(), column: a.binding.column },
        f.now,
      );
    if (state === "stale_unknown") f.now.setTime(f.now.getTime() + MODEL_IN_FLIGHT_MS);
    if (state === "acknowledged_unknown") {
      f.now.setTime(f.now.getTime() + 600_001);
      const q = await f.quote();
      const confirmation = await f.admit(q);
      if (confirmation.kind !== "confirmation_required") throw new Error("Missing nonce");
      nonce = confirmation;
      expect(
        await admitModelRun(f.database, { ...f.consent(q), confirmUnknown: confirmation }, f.ports),
      ).toMatchObject({ kind: "admitted", replayed: false });
    }
  }
  return { quote, a, observer, context, nonce: suppliedNonce ?? nonce, priorOperations };
}

it.each(states.flatMap((state) => events.map((event, index) => ({ state, event, index }))))(
  "transition $state + $event retains reservations and possible-send identity",
  async ({ state, event, index }) => {
    const s = await start(state, event);
    let extraOperations = 0;
    if (["valid_run", "stale_quote", "nonce", "spent_nonce"].includes(event)) {
      const q = await f.quote();
      if (event === "stale_quote") f.live().budget.version++;
      const confirmUnknown = event === "spent_nonce" || event === "nonce" ? s.nonce : undefined;
      const result = await admitModelRun(f.database, { ...f.consent(q), confirmUnknown }, f.ports);
      if (state === "acknowledged_unknown" && event === "spent_nonce") {
        expect(result).toMatchObject({ kind: "not_dispatched", reason: "confirmation_spent" });
      } else if (state === "refused" && event === "stale_quote") {
        expect(result).toMatchObject({
          kind: "admitted",
          replacementRefusal: { reason: "budget_changed", quoteInvalidated: true },
        });
      } else {
        expect(result).toMatchObject({ kind: "admitted", replayed: state !== "refused" });
        if (result.kind !== "admitted") throw new Error("Missing replay");
        // Only a refused column may get a new attempt inside a live root.
        if (state === "refused") {
          extraOperations++;
          expect(result.attempts[0].id).not.toBe(s.a.id);
        } else if (state !== "acknowledged_unknown") expect(result.attempts[0].id).toBe(s.a.id);
      }
    } else if (event === "dispatch" || event === "definite_refusal" || event === "busy") {
      if (event === "definite_refusal") s.context.columns[0].catalogRevision = "changed";
      if (event === "busy") {
        // Fill only the currently free account slots using different content.
        const count = state === "in_flight" ? 1 : 2;
        for (let i = 0; i < count; i++) {
          const q = await f.quote(1, (c) => {
            c.input.prompt = `Other ${i}`;
          });
          const run = await f.admit(q);
          if (run.kind !== "admitted") throw new Error("Missing slot holder");
          await createModelRequestJournal(f.database, f.ports).beforeDispatch(run.attempts[0].id);
          extraOperations++;
        }
      }
      if (state === "admitted" && event === "dispatch") await s.observer.beforeDispatch(s.a.id);
      else
        await expect(s.observer.beforeDispatch(s.a.id)).rejects.toMatchObject({
          reason:
            state === "admitted"
              ? event === "busy"
                ? "account_concurrency"
                : "catalog_changed"
              : state === "refused"
                ? "catalog_changed"
                : "already_dispatched",
        });
    } else if (event === "observation" || event === "late_receipt") {
      const record = () =>
        recordModelDispatchEvidence(
          f.database,
          s.a.id,
          { ...measuredResult(), column: s.a.binding.column },
          f.now,
        );
      if (state === "admitted" || state === "refused")
        await expect(record()).rejects.toMatchObject({ reason: "reservation_unavailable" });
      else await record();
    } else {
      const elapsed = (
        {
          lease_expiry: 60_001,
          reservation_expiry: 86_400_001,
          window_expiry: 600_001,
        } as Partial<Record<typeof event, number>>
      )[event];
      if (elapsed === undefined) throw new Error("Unknown expiry event");
      f.now.setTime(f.now.getTime() + elapsed);
      if (event === "reservation_expiry" && state === "admitted")
        await expect(s.observer.beforeDispatch(s.a.id)).rejects.toMatchObject({
          reason: "reservation_unavailable",
        });
    }
    const a = await f.database.$transaction((tx) => readModelAttempt(tx, s.a.id, f.now));
    expect(a.state).toBe(next[state][index]);
    const operations = (
      await f.sql.query<{ state: string; operation_id: string }>(
        `SELECT state,operation_id FROM metering_operation`,
      )
    ).rows;
    expect(operations).toHaveLength(
      (state === "acknowledged_unknown" ? 2 : 1) + s.priorOperations + extraOperations,
    );
    expect(operations.find((o) => o.operation_id === s.a.id)?.state).toBe(
      a.state === "refused"
        ? "released"
        : a.state === "observed"
          ? "settled"
          : a.dispatched
            ? "dispatch_intended"
            : "reserved",
    );
    const [root] = (
      await f.sql.query<{ accepted_at: Date }>(
        `SELECT accepted_at FROM model_playground_payment_quotes WHERE id=$1`,
        [s.quote.quoteId],
      )
    ).rows;
    const attempts = await f.database.$transaction((tx) =>
      readModelAttempts(tx, s.quote.quoteId, f.now),
    );
    const live = modelRootIsLive(root.accepted_at, attempts, f.now);
    // The current root never has two dispatchable or in-flight attempts for one column.
    const current = (
      await f.sql.query<{ n: number }>(
        `SELECT count(*)::int n FROM model_playground_payment_attempts WHERE superseded_at IS NULL AND COALESCE(root_quote_id,quote_id)=$1 AND COALESCE(root_column_id,column_id)=$2`,
        [s.quote.quoteId, s.a.rootColumnId],
      )
    ).rows[0];
    expect(current.n).toBe(1);
    expect(
      attempts.filter((a) => a.state === "admitted" || a.state === "in_flight").length,
    ).toBeLessThanOrEqual(1);
    const paidMarks = (
      await f.sql.query(
        `SELECT id FROM model_playground_payment_attempts WHERE dispatched_at IS NOT NULL AND COALESCE(root_quote_id,quote_id)=$1`,
        [s.quote.quoteId],
      )
    ).rows.length;
    expect(paidMarks).toBe(
      s.a.dispatched ||
        !["admitted", "refused"].includes(state) ||
        (event === "dispatch" && state === "admitted")
        ? 1
        : 0,
    );
    expect(live).toBe(
      state !== "acknowledged_unknown" &&
        event !== "reservation_expiry" &&
        (event !== "window_expiry" || state === "admitted"),
    );
    const possible = attempts.filter(
      (a) =>
        a.state === "admitted" &&
        a.reservationState === "reserved" &&
        a.reservationExpiresAt !== null &&
        a.reservationExpiresAt > f.now,
    ).length;
    const replacement =
      state === "refused" && ["valid_run", "nonce", "spent_nonce"].includes(event);
    expect(possible).toBe(
      (state === "admitted" &&
        !["dispatch", "definite_refusal", "reservation_expiry"].includes(event)) ||
        replacement
        ? 1
        : 0,
    );
  },
);
