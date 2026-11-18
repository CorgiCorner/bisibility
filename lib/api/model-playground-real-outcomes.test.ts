import "./model-playground-real.test-helpers";
import * as replay from "@/lib/model-playground/admission-replay";
import * as quotes from "@/lib/model-playground/admission-storage";
import * as launch from "@/lib/model-playground/launch";
import { ModelAdmissionRefusal } from "@/lib/model-playground/payment";
import * as preview from "@/lib/model-playground/preview";
import * as stores from "@/lib/model-playground/store";
import { expect, it, vi } from "vitest";
import { realServiceHarness } from "./model-playground-real.test-helpers";

const h = realServiceHarness();

// Quoted -> committed rejection (200); absent/foreign at admission -> hidden (404).
// Accepted -> unavailable replay (500); run storage failure -> refused attempts (500).
it.each(["missing", "foreign actor", "foreign project", "rejected"] as const)(
  "publishes only a committed rejection: %s at atomic admission",
  async (scenario) => {
    const quoteId = await h.preview();
    const read = quotes.readModelPaymentQuote;
    let reads = 0;
    vi.spyOn(quotes, "readModelPaymentQuote").mockImplementation(async (tx, id) => {
      reads++;
      if (reads === 3 && scenario === "missing")
        await tx.$executeRaw`DELETE FROM model_playground_payment_quotes WHERE id=${id}`;
      const retained = await read(tx, id);
      if (reads === 3 && retained && scenario.startsWith("foreign")) {
        const context = retained.quote.context;
        return {
          ...retained,
          quote: {
            ...retained.quote,
            context: {
              ...context,
              actorId: scenario === "foreign actor" ? "other" : context.actorId,
              projectId: scenario === "foreign project" ? "other" : context.projectId,
            },
          },
        };
      }
      return retained;
    });
    if (scenario === "rejected") await h.sql.query("UPDATE provider_connections SET enabled=false");
    const response = await h.request("POST", "runs", h.body(quoteId), "atomic");
    expect(response.status).toBe(scenario === "rejected" ? 200 : 404);
    const body = await response.json();
    if (scenario === "rejected")
      expect(body.data).toEqual({
        kind: "not_dispatched",
        reason: "connection_unavailable",
        quote_invalidated: true,
      });
    else expect(body.details.reason).toBe("not_found");
    expect(
      (
        await h.sql.query("SELECT rejection FROM model_playground_payment_quotes WHERE id=$1", [
          quoteId,
        ])
      ).rows,
    ).toEqual(
      scenario === "missing"
        ? []
        : [{ rejection: scenario === "rejected" ? "connection_unavailable" : null }],
    );
    expect(await h.count()).toBe(0);
    expect(h.calls).toHaveLength(0);
  },
);

it("returns a server failure after run creation fails and replays its refused attempts", async () => {
  const quoteId = await h.preview();
  const create = stores.createModelPlaygroundStore;
  vi.spyOn(stores, "createModelPlaygroundStore").mockImplementationOnce((db) => ({
    ...create(db),
    launch: async () => {
      throw new Error("Synthetic run storage failure");
    },
  }));
  const failed = await h.request("POST", "runs", h.body(quoteId), "storage-failed");
  expect(failed.status).toBe(500);
  expect((await failed.json()).data).toBeUndefined();
  expect(
    (
      await h.sql.query(
        "SELECT rejection,accepted_at IS NOT NULL AS accepted FROM model_playground_payment_quotes WHERE id=$1",
        [quoteId],
      )
    ).rows,
  ).toEqual([{ rejection: null, accepted: true }]);
  const attempts = (
    await h.sql.query<{ id: string }>(
      "SELECT id,refusal_reason,dispatched_at FROM model_playground_payment_attempts",
    )
  ).rows;
  expect(attempts).toEqual([
    { id: expect.any(String), refusal_reason: "reservation_unavailable", dispatched_at: null },
  ]);
  const retry = await h.request("POST", "runs", h.body(quoteId), "storage-recovery");
  expect(retry.status).toBe(200);
  expect((await retry.json()).data).toMatchObject({
    kind: "admitted",
    replayed: true,
    attempts: [{ id: attempts[0].id, state: "refused" }],
  });
  expect(await h.count()).toBe(1);
  expect(h.calls).toHaveLength(0);
});

it.each(["missing mapping", "late access refusal"] as const)(
  "never denies earlier dispatch when an accepted quote has a %s",
  async (scenario) => {
    const quoteId = await h.preview();
    const first = await h.request("POST", "runs", h.body(quoteId), "paid");
    expect(first.status).toBe(200);
    const admitted = (await first.json()).data;
    expect(h.calls).toHaveLength(1);
    if (scenario === "missing mapping")
      vi.spyOn(replay, "modelAdmittedReplay").mockResolvedValueOnce(null);
    else {
      const read = quotes.readModelPaymentQuote;
      let reads = 0;
      vi.spyOn(quotes, "readModelPaymentQuote").mockImplementation(async (tx, id) => {
        const retained = await read(tx, id);
        if (++reads === 3) await tx.$executeRaw`DELETE FROM users WHERE id=${h.project.ownerId}`;
        return retained;
      });
    }
    const response = await h.request("POST", "runs", h.body(quoteId), "uncertain-replay");
    expect(response.status).toBe(500);
    expect((await response.json()).data).toBeUndefined();
    expect(
      (
        await h.sql.query("SELECT rejection FROM model_playground_payment_quotes WHERE id=$1", [
          quoteId,
        ])
      ).rows,
    ).toEqual([{ rejection: null }]);
    expect(
      (
        await h.sql.query(
          "SELECT id,dispatched_at IS NOT NULL AS dispatched FROM model_playground_payment_attempts",
        )
      ).rows,
    ).toEqual([{ id: admitted.attempts[0].id, dispatched: true }]);
    expect(h.calls).toHaveLength(1);
    expect(await h.count()).toBe(1);
  },
);

it.each([true, false])(
  "requires committed replacement invalidation=%s at the REST boundary",
  async (valid) => {
    const rootId = await h.preview();
    const create = stores.createModelPlaygroundStore;
    vi.spyOn(stores, "createModelPlaygroundStore").mockImplementationOnce((db) => ({
      ...create(db),
      launch: async () => {
        throw new Error("Synthetic run storage failure");
      },
    }));
    await h.request("POST", "runs", h.body(rootId), "root");
    const replacementId = await h.preview();
    vi.spyOn(preview, "resolveModelPaymentContext").mockRejectedValueOnce(
      new ModelAdmissionRefusal("budget_changed"),
    );
    const realLaunch = launch.launchModelPlayground;
    vi.spyOn(launch, "launchModelPlayground").mockImplementationOnce(async (...args) => {
      const outcome = await realLaunch(...args);
      expect(outcome.kind).toBe("admitted");
      if (outcome.kind === "admitted") {
        expect(outcome.admission?.replacementRefusal).toEqual({
          reason: "budget_changed",
          quoteInvalidated: true,
        });
        if (!valid && outcome.admission?.replacementRefusal)
          outcome.admission.replacementRefusal.quoteInvalidated = false;
      }
      return outcome;
    });
    const response = await h.request("POST", "runs", h.body(replacementId), "replacement");
    expect(response.status).toBe(valid ? 200 : 500);
    const body = await response.json();
    if (valid)
      expect(body.data).toMatchObject({
        kind: "admitted",
        quote_id: rootId,
        replacement_refusal: { reason: "budget_changed", quote_invalidated: true },
      });
    else expect(body.data).toBeUndefined();
    expect(
      (
        await h.sql.query(
          "SELECT rejection,accepted_at FROM model_playground_payment_quotes WHERE id=$1",
          [replacementId],
        )
      ).rows,
    ).toEqual([{ rejection: "budget_changed", accepted_at: null }]);
    expect(await h.count()).toBe(1);
    expect(h.calls).toHaveLength(0);
  },
);

it("replays a confirmed admission after the window with its saved run and no dispatch", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await h.sql.exec(`CREATE TABLE model_test_clock(now timestamptz NOT NULL);
    CREATE FUNCTION clock_timestamp() RETURNS timestamptz LANGUAGE sql AS 'SELECT now FROM model_test_clock';`);
  await h.sql.query("INSERT INTO model_test_clock VALUES($1)", [new Date()]);
  const advance = async () => {
    vi.setSystemTime(Date.now() + 700000);
    h.now.setTime(Date.now());
    await h.sql.query("UPDATE model_test_clock SET now=$1", [new Date()]);
  };
  const q1 = await h.preview();
  h.pause(async () => {
    throw new Error("Synthetic missing provider response");
  });
  expect((await h.request("POST", "runs", h.body(q1), "q1")).status).toBe(200);
  expect(h.calls).toHaveLength(1);
  await advance();
  const q2 = await h.preview();
  const required = await h.request("POST", "runs", h.body(q2), "q2-confirmation");
  expect(required.status).toBe(200);
  const confirmation = (await required.json()).data;
  expect(confirmation.kind).toBe("confirmation_required");
  const body = {
    ...h.body(q2),
    confirmUnknown: {
      nonce: confirmation.nonce,
      contentHash: confirmation.content_hash,
      attemptIds: confirmation.attempt_ids,
    },
  };
  h.pause(async () => {});
  let savedRun: string | undefined;
  const realLaunch = launch.launchModelPlayground;
  vi.spyOn(launch, "launchModelPlayground").mockImplementationOnce(async (...args) => {
    const outcome = await realLaunch(...args);
    expect(outcome.kind).toBe("admitted");
    if (outcome.kind === "admitted") savedRun = outcome.result.runId;
    return { kind: "uncertain", message: "Synthetic lost confirmed response" };
  });
  expect((await h.request("POST", "runs", body, "q2-paid")).status).toBe(500);
  expect(savedRun).toEqual(expect.any(String));
  expect(h.calls).toHaveLength(2);
  expect(
    (await h.sql.query("SELECT consumed_root_quote_id FROM model_playground_payment_confirmations"))
      .rows,
  ).toEqual([{ consumed_root_quote_id: q2 }]);
  const attempts = (
    await h.sql.query("SELECT * FROM model_playground_payment_attempts ORDER BY id")
  ).rows;
  const reservations = (await h.sql.query("SELECT * FROM metering_operation ORDER BY operation_id"))
    .rows;
  await advance();
  const retry = await h.request("POST", "runs", body, "q2-recovery");
  expect(retry.status).toBe(200);
  expect((await retry.json()).data).toMatchObject({
    kind: "admitted",
    replayed: true,
    run_id: savedRun,
    quote_id: q2,
  });
  expect(
    (await h.sql.query("SELECT * FROM model_playground_payment_attempts ORDER BY id")).rows,
  ).toEqual(attempts);
  expect(
    (await h.sql.query("SELECT * FROM metering_operation ORDER BY operation_id")).rows,
  ).toEqual(reservations);
  expect(await h.count()).toBe(2);
  expect(h.calls).toHaveLength(2);
});
