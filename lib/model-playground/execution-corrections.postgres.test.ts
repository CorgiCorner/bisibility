import * as dispatch from "@/lib/provider-usage/model-dispatch";
import { afterEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { finishModelColumn } from "./execution-storage";
import { launchModelPlayground } from "./launch";
import { launchHarness } from "./launch.test-support";
import { previewModelPlayground } from "./preview";
import { readModelPlayground } from "./read";
import { recoverModelPlayground } from "./recovery";
import { fitsModelResult } from "./result-budget";
import { largeResult, oversizedCitations } from "./result-budget.test-support";
import * as stores from "./store";

const h = launchHarness();
afterEach(() => vi.restoreAllMocks());
const preview = () => previewModelPlayground(h.runtime, { revision: "revision", input: h.input });
const request = (q: Awaited<ReturnType<typeof preview>>) => ({
  version: 1,
  revision: q.revision,
  requestId: crypto.randomUUID(),
  previewId: q.previewId,
  quoteToken: q.quoteToken,
  configHash: q.configHash,
  byokConsent: "non_guaranteed_estimate_v1",
});
async function admitted() {
  const q = await preview();
  const run = await h.admitOnly(q);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  return { q, run, attempts, input: { projectId: h.context.projectId, runId: run.id, attempts } };
}

test.each(["sources", "citations", "answer"])(
  "over-budget %s keeps the full paid answer in the response and fits its stored copy",
  async (shape) => {
    const q = await preview();
    h.answer((answer) => ({
      ...(shape === "citations" ? oversizedCitations() : largeResult()),
      ...(shape === "answer" ? { answer: "a".repeat(400_000) } : {}),
      column: answer.column,
      providerRequestId: answer.providerRequestId,
    }));
    const out = await launchModelPlayground(h.runtime, request(q));
    expect(out.kind).toBe("admitted");
    if (out.kind !== "admitted") throw new Error("Expected admitted");
    expect(out.result.columns[0].answer).toBe("a".repeat(shape === "answer" ? 400_000 : 24 * 1024));
    const stored = (
      await stores
        .createModelPlaygroundStore(h.runtime.db)
        .read(h.context.projectId, out.result.runId)
    ).columns[0];
    expect(stored.result).not.toBeNull();
    if (!stored.result) throw new Error("Missing stored result");
    expect(fitsModelResult(stored.result)).toBe(true);
    if (shape === "sources") {
      expect(stored.result?.consultedSources?.truncated).toBe(true);
      expect(
        (stored.result?.consultedSources?.sources.length ?? 0) +
          (stored.result?.consultedSources?.omitted ?? 0),
      ).toBe(100);
    } else if (shape === "citations") {
      expect(stored.result.answer).toBe("a".repeat(24 * 1024));
      expect(stored.result.citations.length).toBeLessThan(100);
      expect(stored.result.citationTotals?.total).toBe(100);
      expect(stored.result.citationTotals?.omitted).toBe(100 - stored.result.citations.length);
    } else {
      expect(stored.result.answer).toHaveLength(24 * 1024);
      expect(stored.result.truncation.application).toBe(true);
    }
    expect(stored.result.failure).toBeNull();
    expect(stored.result.state).not.toBe("failed");
    expect((await readModelPlayground(h.runtime, out.result.runId))?.columns[0].answer).toBe(
      "a".repeat(24 * 1024),
    );
    expect(h.calls).toHaveLength(1);
  },
);

test.each(["claim_null", "claim_throws", "fence_throws"])(
  "%s never records a dispatch and ends refused with reservation released",
  async (scenario) => {
    const { input } = await admitted();
    const original = stores.createModelPlaygroundStore;
    let injected = false;
    vi.spyOn(stores, "createModelPlaygroundStore").mockImplementation((db) => {
      const store = original(db);
      return {
        ...store,
        claim: async (value) => {
          if (!injected && scenario.startsWith("claim")) {
            injected = true;
            if (scenario === "claim_null") return null;
            throw new Error("Synthetic claim failure");
          }
          return store.claim(value);
        },
        fenceDispatch: async (value) => {
          if (!injected && scenario === "fence_throws") {
            injected = true;
            throw new Error("Synthetic fence failure");
          }
          return store.fenceDispatch(value);
        },
      };
    });
    expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("refused");
    const [attempt] = await h.runtime.db.$transaction((tx) =>
      readModelAttempts(tx, input.attempts[0].quoteId),
    );
    expect(attempt).toMatchObject({
      dispatched: false,
      state: "refused",
      reservationState: "released",
    });
    expect((await readModelPlayground(h.runtime, input.runId))?.progress?.[0].state).toBe(
      "refused",
    );
    expect(h.calls).toHaveLength(0);
  },
);

test.each(["deadline", "retries", "executor_error"])(
  "%s before send refuses rather than orphaning admitted work",
  async (scenario) => {
    const { input } = await admitted();
    if (scenario === "executor_error")
      vi.mocked(h.runtime.resolve).mockRejectedValueOnce(new Error("Synthetic resolve error"));
    else {
      vi.spyOn(dispatch, "beforeModelDispatch").mockRejectedValue(
        new dispatch.ModelDispatchRefusal("account_concurrency"),
      );
      h.runtime.wait = async () => {
        if (scenario === "deadline") vi.spyOn(Date, "now").mockReturnValue(Date.now() + 240_000);
      };
    }
    expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("refused");
    const [attempt] = await h.runtime.db.$transaction((tx) =>
      readModelAttempts(tx, input.attempts[0].quoteId),
    );
    expect(attempt).toMatchObject({
      dispatched: false,
      state: "refused",
      reservationState: "released",
    });
    const row = (
      await stores.createModelPlaygroundStore(h.runtime.db).read(input.projectId, input.runId)
    ).columns[0];
    expect(row.state).toBe("cancelled");
    expect(h.calls).toHaveLength(0);
  },
);

test("a paid answer can be completed without a caller lease token", async () => {
  const { input, run } = await admitted();
  const store = stores.createModelPlaygroundStore(h.runtime.db);
  const key = { projectId: input.projectId, runId: run.id, columnId: h.input.columns[0].columnId };
  const claim = await store.claim({ ...key, leaseSeconds: 180 });
  await store.fenceDispatch({ ...key, leaseToken: claim?.leaseToken });
  await finishModelColumn(h.runtime.db, key, {
    ...largeResult(),
    column: h.input.columns[0],
    consultedSources: undefined,
  });
  expect((await store.read(input.projectId, run.id)).columns[0].result?.answer).toHaveLength(
    24 * 1024,
  );
});

test("abort after dispatch preserves the possible-send fence across replay", async () => {
  const { input } = await admitted();
  h.pause(async () => {
    throw new Error("Synthetic abort after dispatch");
  });
  expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("pending");
  const attempts = await h.runtime.db.$transaction((tx) =>
    readModelAttempts(tx, input.attempts[0].quoteId),
  );
  expect(attempts[0].dispatched).toBe(true);
  expect((await executeModelPlayground(h.runtime, { ...input, attempts }))[0].state).toBe(
    "already_dispatched",
  );
  expect(h.calls).toHaveLength(1);
});

test("recovery journals a fenced column already expired before the observation was committed", async () => {
  const { input } = await admitted();
  const attemptId = input.attempts[0].id;
  h.pause(async () => {
    await h.ageDispatches();
    await h.expireLeases();
    const [row] = (
      await h.sql.query<{ columnId: string; leaseToken: string }>(
        `SELECT "columnId","leaseToken" FROM model_playground_columns`,
      )
    ).rows;
    const { projectId, runId } = input;
    const store = stores.createModelPlaygroundStore(h.runtime.db);
    expect(await store.expireDispatched({ projectId, runId, ...row })).toBe(true);
    const observe = async () =>
      (await h.runtime.db.$transaction((tx) => readModelAttempts(tx, input.attempts[0].quoteId)))[0]
        .observedAt;
    expect(await observe()).toBeNull();
    await recoverModelPlayground(h.runtime, { projectId, runId });
    const observedAt = await observe();
    expect(observedAt).toBeInstanceOf(Date);
    await recoverModelPlayground(h.runtime, { projectId, runId });
    expect(await observe()).toEqual(observedAt);
    expect(h.calls).toEqual([attemptId]);
  });
  await executeModelPlayground(h.runtime, input);
});

test("a paid answer finishes an expired column without a local lease and cannot replace the first answer", async () => {
  const q = await preview();
  h.pause(async () => {
    await expect(
      h.sql.exec(
        `UPDATE model_playground_columns SET "leaseToken"='11111111-1111-4111-8111-111111111111'`,
      ),
    ).rejects.toThrow();
    await expect(
      h.sql.exec(
        `UPDATE model_playground_columns SET "dispatchStartedAt"="dispatchStartedAt"+interval '1 second'`,
      ),
    ).rejects.toThrow();
    await h.sql.exec(
      `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second'`,
    );
    const row = (
      await h.sql.query<{ runId: string; columnId: string; leaseToken: string }>(
        `SELECT "runId","columnId","leaseToken" FROM model_playground_columns`,
      )
    ).rows[0];
    expect(
      await stores
        .createModelPlaygroundStore(h.runtime.db)
        .expireDispatched({ projectId: h.context.projectId, ...row }),
    ).toBe(true);
    await expect(
      h.sql.query(
        `UPDATE model_playground_columns SET state='completed',result=$1::jsonb,"finishedAt"=clock_timestamp(),"leaseToken"='11111111-1111-4111-8111-111111111111'`,
        [
          JSON.stringify({
            ...largeResult(),
            column: h.input.columns[0],
            consultedSources: undefined,
          }),
        ],
      ),
    ).rejects.toThrow();
  });
  const out = await launchModelPlayground(h.runtime, request(q));
  if (out.kind !== "admitted") throw new Error("Expected paid answer");
  const key = {
    projectId: h.context.projectId,
    runId: out.result.runId,
    columnId: h.input.columns[0].columnId,
    attemptId: h.calls[0],
  };
  const { completeObservedModelColumn } = await import("./store-observed");
  await completeObservedModelColumn(h.runtime.db, key, {
    ...out.result.columns[0],
    answer: "Must not replace",
  });
  const stored = (
    await stores.createModelPlaygroundStore(h.runtime.db).read(key.projectId, key.runId)
  ).columns[0];
  expect(stored).toMatchObject({
    state: "completed",
    result: { answer: "An answer with two citations." },
  });
  await expect(
    h.sql.exec(
      `UPDATE model_playground_columns SET result=jsonb_set(result,'{answer}','"Replaced"'::jsonb)`,
    ),
  ).rejects.toThrow();
  expect(h.calls).toHaveLength(1);
});
test("completion without a dispatched matching attempt is refused", async () => {
  const { input, run } = await admitted();
  const { completeObservedModelColumn } = await import("./store-observed");
  const key = {
    projectId: input.projectId,
    runId: run.id,
    columnId: h.input.columns[0].columnId,
    attemptId: input.attempts[0].id,
  };
  await expect(
    completeObservedModelColumn(h.runtime.db, key, {
      ...largeResult(),
      column: h.input.columns[0],
      consultedSources: undefined,
    }),
  ).rejects.toMatchObject({ code: "stale_lease" });
  expect(h.calls).toHaveLength(0);
});

test("the dispatch marker only runs after a claimed and fenced column", async () => {
  const { input } = await admitted();
  const mark = dispatch.beforeModelDispatch;
  vi.spyOn(dispatch, "beforeModelDispatch").mockImplementation(async (db, ports, id) => {
    const [row] = await db.$transaction(
      (tx) =>
        tx.$queryRaw<
          { state: string; dispatchStartedAt: Date | null }[]
        >`SELECT state,"dispatchStartedAt" FROM model_playground_columns`,
    );
    expect(row.state).toBe("claimed");
    expect(row.dispatchStartedAt).not.toBeNull();
    return mark(db, ports, id);
  });
  expect((await executeModelPlayground(h.runtime, input))[0].state).toBe("finished");
  expect(h.calls).toHaveLength(1);
});
