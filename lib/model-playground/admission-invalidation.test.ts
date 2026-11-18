import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { createModelRequestJournal } from "@/lib/provider-usage/model-request-journal";
import { afterEach, describe, expect, it, vi } from "vitest";
import { admitModelRun } from "./admission";
import { paymentHarness } from "./admission.postgres.test-support";
import { consumeModelConfirmation, issueModelConfirmation } from "./admission-confirmation";
import * as replay from "./admission-replay";
import { readModelPaymentQuote as replayQuote } from "./admission-storage";
import { launchModelPlayground } from "./launch";
import { launchHarness, launchRequest } from "./launch.test-support";
import { admitAndCreateModelRun } from "./launch-admission";
import * as failure from "./launch-failure";
import { isModelPlaygroundLaunchRejection } from "./launch-service";
import {
  prepareModelConnections,
  previewModelPlayground,
  resolveModelPaymentContext,
} from "./preview";
import * as stores from "./store";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("quote rejection state model", () => {
  const f = paymentHarness();
  // Present/unaccepted -> rejected (true); absent, foreign or accepted -> unchanged (false).
  it.each([
    ["missing", false, "quote_missing"],
    ["foreign actor", false, "access_denied"],
    ["foreign project", false, "access_denied"],
    ["accepted foreign actor", false, "access_denied"],
    ["accepted foreign project", false, "access_denied"],
    ["accepted config", false, "configuration_changed"],
    ["accepted consent", false, "consent_required"],
    ["accepted access", false, "access_denied"],
    ["accepted mapping", false, null],
    ["accepted own consumption", false, null],
    ["unaccepted config", true, "configuration_changed"],
    ["already rejected", true, "quote_invalidated"],
  ] as const)(
    "%s reports committed invalidation=%s",
    async (scenario, quoteInvalidated, reason) => {
      const q = await f.quote();
      const input = f.consent(q);
      if (scenario.startsWith("accepted")) expect((await f.admit(q)).kind).toBe("admitted");
      if (scenario === "missing")
        await f.sql.query("DELETE FROM model_playground_payment_quotes WHERE id=$1", [q.quoteId]);
      if (scenario.endsWith("foreign actor")) input.actorId = "other";
      if (scenario.endsWith("foreign project")) input.projectId = "other";
      if (scenario.endsWith("config")) input.configHash = "b".repeat(64);
      if (scenario === "accepted consent") Object.assign(input, { consent: undefined });
      if (scenario === "accepted access") await f.sql.exec("DELETE FROM memberships");
      if (scenario === "accepted mapping")
        vi.spyOn(replay, "modelAdmittedReplay").mockResolvedValueOnce(null);
      if (scenario === "accepted own consumption") {
        await createModelRequestJournal(f.database, f.ports).beforeDispatch(
          q.context.columns[0].binding.attemptId,
        );
        const confirmation = await f.database.$transaction(async (tx) => {
          const issued = await issueModelConfirmation(tx, q, ["attempt"], f.now);
          await consumeModelConfirmation(tx, issued.nonce, q.quoteId, f.now);
          return issued;
        });
        Object.assign(input, { confirmUnknown: confirmation });
        f.now.setTime(+f.now + 700000);
      }
      if (scenario === "already rejected") {
        expect(
          await admitModelRun(f.database, { ...input, configHash: "b".repeat(64) }, f.ports),
        ).toMatchObject({ kind: "not_dispatched", quoteInvalidated: true });
      }
      const outcome = await admitModelRun(f.database, input, f.ports);
      if (scenario === "accepted own consumption")
        expect(outcome).toMatchObject({ kind: "admitted", quoteId: q.quoteId, replayed: true });
      else
        expect(outcome).toEqual(
          scenario.startsWith("accepted")
            ? { kind: "uncertain", quoteInvalidated: false }
            : { kind: "not_dispatched", reason, quoteInvalidated },
        );
      const rows = (
        await f.sql.query<{ rejection: string | null; accepted_at: Date | null }>(
          "SELECT rejection,accepted_at FROM model_playground_payment_quotes WHERE id=$1",
          [q.quoteId],
        )
      ).rows;
      expect(Boolean(rows[0]?.rejection)).toBe(quoteInvalidated);
      if (scenario.startsWith("accepted")) expect(rows[0].accepted_at).not.toBeNull();
      expect(await f.count("metering_operation")).toBe(scenario.startsWith("accepted") ? 1 : 0);
    },
  );

  it("replacement rollback returns the committed rejection of the replacement quote", async () => {
    const root = await f.quote();
    expect((await f.admit(root)).kind).toBe("admitted");
    await f.sql.exec(`UPDATE provider_connections SET "credentialsEncrypted"='rotated'`);
    await expect(
      createModelRequestJournal(f.database, f.ports).beforeDispatch(
        root.context.columns[0].binding.attemptId,
      ),
    ).rejects.toMatchObject({ reason: "credential_changed" });
    const replacement = await f.quote(1, (context) => {
      const binding = context.columns[0].binding;
      binding.credentialVersion =
        ownCredentialVersion(binding.column.providerId, binding.connectionId, "rotated") ?? "";
    });
    f.live().budget.version++;
    expect(await f.admit(replacement)).toMatchObject({
      kind: "admitted",
      quoteId: root.quoteId,
      replacementRefusal: { reason: "budget_changed", quoteInvalidated: true },
    });
    expect(
      (
        await f.sql.query(
          "SELECT rejection,accepted_at FROM model_playground_payment_quotes WHERE id=$1",
          [replacement.quoteId],
        )
      ).rows,
    ).toEqual([{ rejection: "budget_changed", accepted_at: null }]);
    expect(await f.count("metering_operation")).toBe(1);
  });

  it("a spent replay plan changes no quote until its enclosing refusal commits", async () => {
    const root = await f.quote();
    expect((await f.admit(root)).kind).toBe("admitted");
    await createModelRequestJournal(f.database, f.ports).beforeDispatch(
      root.context.columns[0].binding.attemptId,
    );
    const confirmation = await f.database.$transaction(async (tx) => {
      const issued = await issueModelConfirmation(tx, root, ["attempt"], f.now);
      await consumeModelConfirmation(tx, issued.nonce, root.quoteId, f.now);
      return issued;
    });
    f.now.setTime(+f.now + 700000);
    const q = await f.quote();
    const input = { ...f.consent(q), confirmUnknown: confirmation };
    expect(
      await f.database.$transaction((tx) => replay.previousModelAdmission(tx, q, input, f.now)),
    ).toMatchObject({
      kind: "not_dispatched",
      reason: "confirmation_spent",
      quoteInvalidated: false,
    });
    expect(
      (
        await f.sql.query("SELECT rejection FROM model_playground_payment_quotes WHERE id=$1", [
          q.quoteId,
        ])
      ).rows,
    ).toEqual([{ rejection: null }]);
    expect(await admitModelRun(f.database, input, f.ports)).toMatchObject({
      kind: "not_dispatched",
      reason: "confirmation_spent",
      quoteInvalidated: true,
    });
    expect(
      (
        await f.sql.query("SELECT rejection FROM model_playground_payment_quotes WHERE id=$1", [
          q.quoteId,
        ])
      ).rows,
    ).toEqual([{ rejection: "confirmation_spent" }]);
  });
});

describe("committed launch refusal", () => {
  const h = launchHarness();
  it.each(["existing run", "dispatched attempt"] as const)(
    "rethrows a run storage failure when refusal cannot prove no launch: %s",
    async (scenario) => {
      const quote = await previewModelPlayground(h.runtime, {
        revision: "revision",
        input: h.input,
      });
      const request = launchRequest(quote);
      const access = await h.runtime.authorize("create");
      const connections = await prepareModelConnections(h.runtime, access, h.input);
      const create = stores.createModelPlaygroundStore;
      const error = new Error("Synthetic run storage failure after progress");
      vi.spyOn(stores, "createModelPlaygroundStore").mockImplementation((db) => {
        const store = create(db);
        return {
          ...store,
          launch: async (input) => {
            if (scenario === "existing run") await store.launch(input);
            else {
              const frozen = await h.runtime.db.$transaction((tx) =>
                replayQuote(tx, quote.previewId),
              );
              if (!frozen) throw new Error("Missing admitted quote");
              await createModelRequestJournal(h.runtime.db, {
                now: h.runtime.now,
                readCurrent: (tx, q) =>
                  resolveModelPaymentContext(
                    h.runtime,
                    tx,
                    access,
                    q.context.input,
                    connections,
                    q,
                  ),
              }).beforeDispatch(frozen.quote.context.columns[0].binding.attemptId);
            }
            throw error;
          },
        };
      });
      const refused = vi.spyOn(failure, "refuseUncreatedModelRun");
      await expect(
        admitAndCreateModelRun(h.runtime, access, request, connections, undefined, false),
      ).rejects.toBe(error);
      expect(refused).toHaveBeenCalledOnce();
      await expect(refused.mock.results[0].value).resolves.toBe(false);
      expect(
        (
          await h.sql.query(
            "SELECT dispatched_at IS NOT NULL AS dispatched,refusal_reason FROM model_playground_payment_attempts",
          )
        ).rows,
      ).toEqual([
        {
          dispatched: scenario === "dispatched attempt",
          refusal_reason: null,
        },
      ]);
      expect(
        (await h.sql.query<{ n: number }>("SELECT count(*)::int AS n FROM model_playground_runs"))
          .rows[0].n,
      ).toBe(scenario === "existing run" ? 1 : 0);
      expect((await launchModelPlayground(h.runtime, request)).kind).toBe("uncertain");
      expect(h.calls).toHaveLength(0);
    },
  );
  it("refuses uncreated attempts while keeping the accepted quote unchanged", async () => {
    const quote = await previewModelPlayground(h.runtime, { revision: "revision", input: h.input });
    const create = stores.createModelPlaygroundStore;
    vi.spyOn(stores, "createModelPlaygroundStore").mockImplementation((db) => ({
      ...create(db),
      launch: async () => {
        throw new Error("Synthetic run storage failure");
      },
    }));
    const outcome = await launchModelPlayground(h.runtime, launchRequest(quote));
    expect(outcome).toEqual({
      kind: "run_not_created",
      message: "The run was not started. Refresh the estimate and try again.",
    });
    expect(isModelPlaygroundLaunchRejection(outcome)).toBe(true);
    expect(
      (
        await h.sql.query(
          "SELECT rejection,accepted_at IS NOT NULL AS accepted FROM model_playground_payment_quotes WHERE id=$1",
          [quote.previewId],
        )
      ).rows,
    ).toEqual([{ rejection: null, accepted: true }]);
    expect(
      (
        await h.sql.query(
          "SELECT refusal_reason,dispatched_at FROM model_playground_payment_attempts",
        )
      ).rows,
    ).toEqual([{ refusal_reason: "reservation_unavailable", dispatched_at: null }]);
    expect(h.calls).toHaveLength(0);
  });
});
