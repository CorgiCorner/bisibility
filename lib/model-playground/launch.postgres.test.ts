import { expect, test, vi } from "vitest";
import { admitModelRun } from "./admission";
import { readModelAttempts } from "./admission-storage";
import { modelConfirmationInput } from "./composer-quote";
import { executeModelPlayground } from "./execute";
import { launchModelPlayground } from "./launch";
import {
  addPrivateAdmissionFieldOnce,
  launchHarness,
  launchRequest as request,
} from "./launch.test-support";
import { isModelPlaygroundConfirmation } from "./launch-service";
import {
  prepareModelConnections,
  previewModelPlayground,
  resolveModelPaymentContext,
} from "./preview";
import { readModelPlayground } from "./read";

const h = launchHarness();
const transitions: [string, () => Promise<void>][] = [];
const transition = (name: string, run: () => Promise<void>) => transitions.push([name, run]);
const preview = () => previewModelPlayground(h.runtime, { revision: "revision", input: h.input });
for (const scenario of ["success", "key_changed", "role_revoked", "sibling_failure"] as const) {
  transition(`launch transition: ${scenario}`, async () => {
    if (scenario === "sibling_failure") {
      h.input.columns.push({
        ...structuredClone(h.input.columns[0]),
        columnId: crypto.randomUUID(),
      });
      h.fail(h.input.columns[0].columnId);
    }
    const quote = await preview();
    const req = request(quote);
    if (scenario === "key_changed")
      await h.sql.exec(`UPDATE provider_connections SET "credentialsEncrypted"='changed'`);
    if (scenario === "role_revoked") await h.sql.exec(`UPDATE memberships SET role='viewer'`);
    const outcome = await launchModelPlayground(h.runtime, req);
    if (scenario === "key_changed" || scenario === "role_revoked") {
      expect(outcome.kind).toBe("not_dispatched");
      expect(h.calls).toHaveLength(0);
    } else {
      expect(outcome.kind).toBe("admitted");
      if (outcome.kind !== "admitted") return;
      expect(outcome.result.columns).toHaveLength(h.input.columns.length);
      expect(h.calls).toHaveLength(h.input.columns.length);
      if (scenario === "sibling_failure")
        expect(outcome.result.columns.map((c) => c.state)).toEqual(["failed", "completed"]);
    }
  });
}
transition(
  "duplicate Run, concurrent launch and remount share one durable run without repeat dispatch",
  async () => {
    const quote = await preview();
    const req = request(quote);
    const outcomes = await Promise.all([
      launchModelPlayground(h.runtime, req),
      launchModelPlayground(h.runtime, { ...req, requestId: crypto.randomUUID() }),
    ]);
    const reconnect = await preview();
    const again = request(reconnect);
    outcomes.push(await launchModelPlayground(h.runtime, again));
    expect(outcomes.map((o) => o.kind)).toEqual(["admitted", "admitted", "admitted"]);
    expect(
      new Set(outcomes.flatMap((o) => (o.kind === "admitted" ? [o.result.runId] : []))).size,
    ).toBe(1);
    expect(h.calls).toHaveLength(1);
    expect((await h.sql.query(`SELECT * FROM model_playground_runs`)).rows).toHaveLength(1);
  },
);
transition(
  "altered preview is invalidated; unexpected admission errors remain uncertain",
  async () => {
    const quote = await preview();
    const req = request(quote);
    expect(
      (await launchModelPlayground(h.runtime, { ...req, configHash: "b".repeat(64) })).kind,
    ).toBe("not_dispatched");
    expect((await launchModelPlayground(h.runtime, req)).kind).toBe("not_dispatched");
    const db = {
      $transaction: vi.fn().mockRejectedValue(new Error("Synthetic connection lost after commit")),
    };
    expect((await launchModelPlayground({ ...h.runtime, db } as typeof h.runtime, req)).kind).toBe(
      "uncertain",
    );
    expect(h.calls).toHaveLength(0);
  },
);
transition("read refuses cross-project and denied access and never resolves a model", async () => {
  const quote = await preview();
  const req = request(quote);
  const launched = await launchModelPlayground(h.runtime, req);
  expect(launched.kind).toBe("admitted");
  if (launched.kind !== "admitted") return;
  vi.mocked(h.runtime.resolve).mockClear();
  expect((await readModelPlayground(h.runtime, launched.result.runId))?.columns).toHaveLength(1);
  expect(h.runtime.resolve).not.toHaveBeenCalled();
  const authorize = async () => ({
    actorId: "other",
    projectId: "other",
    principal: "other",
    namespace: "fixture",
  });
  expect(await readModelPlayground({ ...h.runtime, authorize }, launched.result.runId)).toBeNull();
  h.block();
  expect(await readModelPlayground(h.runtime, launched.result.runId)).toBeNull();
  expect(h.calls).toHaveLength(1);
});
transition("permission check precedes admission, writes and connection lookup", async () => {
  h.block();
  expect((await launchModelPlayground(h.runtime, {})).kind).toBe("access_denied");
  await expect(preview()).rejects.toThrow("Denied");
  expect(h.runtime.resolve).not.toHaveBeenCalled();
  expect((await h.sql.query(`SELECT * FROM model_playground_payment_quotes`)).rows).toHaveLength(0);
});
for (const kind of ["dataforseo", "hosted", "consumer"])
  transition(`rejects forged ${kind} before metadata or payment writes`, async () => {
    const column = h.input.columns[0];
    if (kind === "dataforseo") Object.assign(column, { providerId: "dataforseo" });
    if (kind === "hosted") Object.assign(column.payment, { fundingSource: "hosted" });
    if (kind === "consumer") Object.assign(column, { sourceKind: "consumer" });
    await expect(preview()).rejects.toThrow();
    expect(h.runtime.resolve).not.toHaveBeenCalled();
    expect(h.calls).toHaveLength(0);
  });
for (const changed of ["key", "role", "permission"] as const)
  transition(
    `dispatch rechecks ${changed} after admission and persists no-send refusal`,
    async () => {
      const quote = await preview();
      const run = await h.admitOnly(quote);
      if (changed === "permission") h.block();
      else
        await h.sql.exec(
          changed === "key"
            ? `UPDATE provider_connections SET "credentialsEncrypted"='changed'`
            : `UPDATE memberships SET role='viewer'`,
        );
      const attempts = await h.runtime.db.$transaction((tx) =>
        readModelAttempts(tx, quote.previewId),
      );
      const execution = await executeModelPlayground(h.runtime, {
        projectId: h.context.projectId,
        runId: run.id,
        attempts,
      });
      expect(execution[0].state).toBe("refused");
      expect(h.calls).toHaveLength(0);
      if (changed !== "permission")
        expect((await readModelPlayground(h.runtime, run.id))?.progress?.[0].state).toBe("refused");
    },
  );
transition(
  "an ambiguous old attempt requires the exact server nonce for a new content run",
  async () => {
    const quote = await preview();
    const access = await h.runtime.authorize("create");
    const connections = await prepareModelConnections(h.runtime, access, h.input);
    await admitModelRun(
      h.runtime.db,
      {
        quoteId: quote.previewId,
        ...access,
        configHash: quote.configHash,
        consent: "non_guaranteed_estimate_v1",
      },
      {
        now: h.runtime.now,
        readCurrent: (tx, frozen) =>
          resolveModelPaymentContext(h.runtime, tx, access, frozen.context.input, connections),
      },
    );
    const { beforeModelDispatch } = await import("@/lib/provider-usage/model-dispatch");
    await beforeModelDispatch(
      h.runtime.db,
      {
        now: h.runtime.now,
        readCurrent: (tx, frozen) =>
          resolveModelPaymentContext(h.runtime, tx, access, frozen.context.input, connections),
      },
      `model:${quote.previewId}:${h.input.columns[0].columnId}`,
    );
    h.now.setTime(+h.now + 700000);
    const next = await preview();
    const req = request(next);
    const raw = addPrivateAdmissionFieldOnce();
    const required = await launchModelPlayground(h.runtime, req);
    raw.mockRestore();
    expect(required.kind).toBe("confirmation_required");
    expect(isModelPlaygroundConfirmation(required)).toBe(true);
    expect(Object.keys(required).sort()).toEqual(
      ["kind", "nonce", "contentHash", "attemptIds", "earlierAttemptUnconfirmed"].sort(),
    );
    expect(h.calls).toHaveLength(0);
    if (required.kind !== "confirmation_required") return;
    expect(required.attemptIds).toEqual([
      `model:${quote.previewId}:${h.input.columns[0].columnId}`,
    ]);
    const accepted = await launchModelPlayground(h.runtime, {
      ...req,
      confirmUnknown: modelConfirmationInput(
        { contentKey: "current", value: required },
        "current",
        true,
      ),
    });
    expect(accepted.kind).toBe("admitted");
    expect(h.calls).toHaveLength(1);
  },
);
transition(
  "account slots wait and retry the same attempt while siblings stay independent",
  async () => {
    const requests: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      h.input.prompt = `Independent question ${i}`;
      const quote = await preview();
      const req = request(quote);
      requests.push(req);
    }
    const release: (() => void)[] = [];
    let inflight = 0;
    let peak = 0;
    h.pause(async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise<void>((resolve) => release.push(resolve));
      inflight--;
    });
    const delays: number[] = [];
    h.runtime.wait = async (ms) => {
      delays.push(ms);
      await vi.waitFor(() => expect(h.calls).toHaveLength(2), { timeout: 10000 });
      release.shift()?.();
      await vi.waitFor(
        async () =>
          expect(
            (
              await h.sql.query(
                `SELECT id FROM model_playground_payment_attempts WHERE observed_at IS NOT NULL`,
              )
            ).rows.length,
          ).toBeGreaterThan(0),
        { timeout: 10000 },
      );
    };
    const running = Promise.all(requests.map((req) => launchModelPlayground(h.runtime, req)));
    try {
      await vi.waitFor(() => expect(delays.length).toBeGreaterThan(0), { timeout: 10000 });
      await vi.waitFor(() => expect(h.calls).toHaveLength(3), { timeout: 10000 });
    } finally {
      h.pause(async () => {});
      for (const resolve of release) resolve();
      await running;
    }
    expect(peak).toBe(2);
    expect(new Set(h.calls).size).toBe(3);
    const outcomes = await running;
    expect(outcomes.map((o) => o.kind)).toEqual(["admitted", "admitted", "admitted"]);
    expect(
      new Set(outcomes.flatMap((o) => (o.kind === "admitted" ? [o.result.runId] : []))).size,
    ).toBe(3);
  },
);
transition(
  "supplementary observation and result-write failures preserve the paid answer",
  async () => {
    const quote = await preview();
    const req = request(quote);
    await h.sql.exec(`CREATE FUNCTION reject_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture storage failure'; END $$;
    CREATE TRIGGER fail_observation BEFORE INSERT ON model_playground_payment_observations FOR EACH ROW EXECUTE FUNCTION reject_evidence();
    CREATE TRIGGER fail_result BEFORE UPDATE ON model_playground_columns FOR EACH ROW WHEN (NEW.result IS NOT NULL) EXECUTE FUNCTION reject_evidence();`);
    const outcome = await launchModelPlayground(h.runtime, req);
    expect(outcome.kind).toBe("admitted");
    if (outcome.kind !== "admitted") return;
    expect(outcome.result.columns[0]?.answer).toBe("An answer with two citations.");
    expect(outcome.result.columns[0]?.state).toBe("completed");
    expect(h.calls).toHaveLength(1);
  },
);
test.each(transitions)("%s", async (_name, exercise) => exercise());
