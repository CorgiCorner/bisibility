import * as accounting from "@/lib/provider-usage/model-accounting";
import * as dispatch from "@/lib/provider-usage/model-dispatch";
import { afterEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import * as transitions from "./column-state";
import { executeModelPlayground } from "./execute";
import * as executionStorage from "./execution-storage";
import { launchModelPlayground } from "./launch";
import { launchHarness, launchRequest } from "./launch.test-support";
import { ModelAdmissionRefusal } from "./payment";
import { previewModelPlayground } from "./preview";
import { readModelPlayground } from "./read";
import * as stores from "./store";

const h = launchHarness();
afterEach(() => vi.restoreAllMocks());
const preview = () => previewModelPlayground(h.runtime, { revision: "revision", input: h.input });
async function admitted() {
  const q = await preview();
  const run = await h.admitOnly(q);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  return { q, input: { projectId: h.context.projectId, runId: run.id, attempts } };
}

test("a duplicate launch's store failure cannot cancel the existing undispatched run", async () => {
  const { q, input } = await admitted();
  const original = stores.createModelPlaygroundStore;
  vi.spyOn(stores, "createModelPlaygroundStore").mockImplementation((db) => ({
    ...original(db),
    launch: async () => {
      throw new Error("Synthetic duplicate store failure");
    },
  }));
  expect((await launchModelPlayground(h.runtime, launchRequest(q))).kind).toBe("uncertain");
  const [attempt] = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  expect(attempt).toMatchObject({
    state: "admitted",
    dispatched: false,
    reservationState: "reserved",
  });
  expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("finished");
  expect(h.calls).toHaveLength(1);
});

test.each(["journal", "typed"])(
  "%s budget refusal survives claim rollback with its actual reason",
  async (kind) => {
    const { q, input } = await admitted();
    if (kind === "journal") {
      const mark = dispatch.beforeModelDispatch;
      vi.spyOn(dispatch, "beforeModelDispatch").mockImplementationOnce((db, ports, id) =>
        mark(
          db,
          {
            ...ports,
            readCurrent: async () => {
              throw new ModelAdmissionRefusal("budget_exhausted");
            },
          },
          id,
        ),
      );
    } else
      vi.spyOn(dispatch, "beforeModelDispatch").mockRejectedValueOnce(
        new dispatch.ModelDispatchRefusal("budget_exhausted"),
      );
    // Even a later projection failure cannot erase the already committed reason.
    vi.spyOn(executionStorage, "refuseUnstartedModelColumn").mockRejectedValueOnce(
      new Error("Synthetic projection outage"),
    );
    expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("pending");
    const [attempt] = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
    expect(attempt).toMatchObject({
      state: "refused",
      refusalReason: "budget_exhausted",
      reservationState: "released",
      dispatched: false,
    });
    expect((await readModelPlayground(h.runtime, input.runId))?.progress?.[0].state).toBe(
      "refused",
    );
    expect(h.calls).toHaveLength(0);
  },
);

test("retention exceptions never skip the paid observation's journal settlement", async () => {
  const q = await preview();
  vi.spyOn(executionStorage, "persistedModelResult").mockImplementation(() => {
    throw new Error("Synthetic fitting failure");
  });
  const journal = vi.spyOn(accounting, "recordModelDispatchEvidence");
  const result = await launchModelPlayground(h.runtime, launchRequest(q));
  expect(result.kind).toBe("admitted");
  expect(journal).toHaveBeenCalledOnce();
  const [attempt] = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  expect(attempt.state).toBe("observed");
  expect(h.calls).toHaveLength(1);
});

test("an observation check failure still settles once and retains the answer", async () => {
  const q = await preview();
  const gate = transitions.requireModelColumnTransition;
  vi.spyOn(transitions, "requireModelColumnTransition").mockImplementation(
    (attempt, column, event) => {
      if (event === "observe") throw new Error("Synthetic observation gate");
      return gate(attempt, column, event);
    },
  );
  const journal = vi.spyOn(accounting, "recordModelDispatchEvidence");
  const out = await launchModelPlayground(h.runtime, launchRequest(q));
  if (out.kind !== "admitted") throw new Error("Expected admitted");
  expect(journal).toHaveBeenCalledOnce();
  const store = await stores
    .createModelPlaygroundStore(h.runtime.db)
    .read(h.context.projectId, out.result.runId);
  expect(store.columns[0].result?.answer).toBe("An answer with two citations.");
  expect(h.calls).toHaveLength(1);
});

test.each(["P2024", "P2028", "55P03", "57014", "40P01"])(
  "%s retries rolled-back storage work without refusing or duplicating HTTP",
  async (code) => {
    const { q, input } = await admitted();
    vi.spyOn(dispatch, "beforeModelDispatch").mockRejectedValueOnce(
      Object.assign(new Error("Synthetic contention"), { code }),
    );
    let waits = 0;
    h.runtime.wait = async () => {
      waits++;
      const [attempt] = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
      expect(attempt).toMatchObject({
        state: "admitted",
        dispatched: false,
        reservationState: "reserved",
      });
      expect(
        (await stores.createModelPlaygroundStore(h.runtime.db).read(input.projectId, input.runId))
          .columns[0].state,
      ).toBe("queued");
    };
    expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("finished");
    expect(waits).toBe(1);
    expect(h.calls).toHaveLength(1);
  },
);

test("the executor consults the transition table for every paid lifecycle event", async () => {
  const { input } = await admitted();
  const gate = vi.spyOn(transitions, "requireModelColumnTransition");
  expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("finished");
  const events = gate.mock.calls.map((call) => call[2]);
  for (const event of ["claim", "fence", "dispatch", "observe", "complete"])
    expect(events).toContain(event);
  expect(events.indexOf("claim")).toBeLessThan(events.indexOf("dispatch"));
  expect(events.indexOf("dispatch")).toBeLessThan(events.indexOf("observe"));
  expect(h.calls).toHaveLength(1);
});

test.each(["fence", "dispatch"] as const)("a table refusal at %s prevents HTTP", async (event) => {
  const { input } = await admitted();
  const gate = transitions.requireModelColumnTransition;
  vi.spyOn(transitions, "requireModelColumnTransition").mockImplementation(
    (attempt, column, current) => {
      if (current === event) throw new Error("Synthetic table refusal");
      return gate(attempt, column, current);
    },
  );
  expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("refused");
  expect(h.calls).toHaveLength(0);
});

test("32000 output tokens are rejected before quote creation or admission", async () => {
  h.input.columns[0].settings.maxOutputTokens = 32000;
  await expect(preview()).rejects.toMatchObject({ reason: "configuration_changed" });
  expect((await h.sql.query("SELECT * FROM model_playground_payment_attempts")).rows).toHaveLength(
    0,
  );
  expect(h.calls).toHaveLength(0);
});

test("run-store failure after admission releases attempts that cannot start", async () => {
  const q = await preview();
  const original = stores.createModelPlaygroundStore;
  vi.spyOn(stores, "createModelPlaygroundStore").mockImplementation((db) => ({
    ...original(db),
    launch: async () => {
      throw new Error("Synthetic unavailable run store");
    },
  }));
  // Definite for the browser, but distinct from a committed quote rejection for REST recovery.
  expect((await launchModelPlayground(h.runtime, launchRequest(q))).kind).toBe("run_not_created");
  const [attempt] = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  expect(attempt).toMatchObject({
    state: "refused",
    dispatched: false,
    reservationState: "released",
  });
  expect(h.calls).toHaveLength(0);
});

test("a truncated stored answer cannot shadow the richer paid observation on reload", async () => {
  const q = await preview();
  const persist = executionStorage.persistedModelResult;
  vi.spyOn(executionStorage, "persistedModelResult").mockImplementation((result) =>
    persist({
      ...result,
      state: "partial",
      answer: "An",
      citations: [],
      citationTotals: { total: result.citations.length, omitted: result.citations.length },
      truncation: { ...result.truncation, application: true, citations: true },
    }),
  );
  const out = await launchModelPlayground(h.runtime, launchRequest(q));
  if (out.kind !== "admitted") throw new Error("Expected admitted");
  const store = await stores
    .createModelPlaygroundStore(h.runtime.db)
    .read(h.context.projectId, out.result.runId);
  expect(store.columns[0].result?.answer).toBe("An");
  const reloaded = await readModelPlayground(h.runtime, out.result.runId);
  expect(reloaded?.columns[0].answer).toBe("An answer with two citations.");
  expect(reloaded?.columns[0].truncation.application).toBe(false);
  expect(h.calls).toHaveLength(1);
});

test("a disconnected cancellation is stored terminal and reads not-started", async () => {
  const { input } = await admitted();
  await h.sql.exec("DELETE FROM provider_connections");
  expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("refused");
  const stored = await stores
    .createModelPlaygroundStore(h.runtime.db)
    .read(input.projectId, input.runId);
  expect(stored.columns[0]).toMatchObject({
    state: "cancelled",
    dispatchStartedAt: null,
    result: { failure: "refused" },
  });
  const read = await readModelPlayground(h.runtime, input.runId);
  expect(read?.progress?.[0].state).toBe("refused");
  expect(read?.columns[0]).toMatchObject({ state: "cancelled", failure: "refused" });
  expect(h.calls).toHaveLength(0);
});

test("transition guards preserve missing-column storage refusals", async () => {
  const { input } = await admitted();
  const identity = {
    projectId: input.projectId,
    runId: input.runId,
    columnId: crypto.randomUUID(),
  };
  const lease = { ...identity, leaseToken: crypto.randomUUID() };
  const store = stores.createModelPlaygroundStore(h.runtime.db);
  expect(await store.claim({ ...identity, leaseSeconds: 30 })).toBeNull();
  await expect(store.expireDispatched(lease)).resolves.toBe(false);
  await expect(store.fenceDispatch(lease)).rejects.toMatchObject({ code: "stale_lease" });
  const { completeObservedModelColumn } = await import("./store-observed");
  const { result } = await import("./contract-fixtures.test-support");
  await expect(
    completeObservedModelColumn(
      h.runtime.db,
      { ...identity, attemptId: input.attempts[0].id },
      { ...result(), column: h.input.columns[0] },
    ),
  ).rejects.toMatchObject({ code: "stale_lease" });
  expect(h.calls).toHaveLength(0);
});
