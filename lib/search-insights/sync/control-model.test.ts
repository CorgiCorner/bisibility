import { describe, expect, it } from "vitest";
import {
  resolveSearchBackfillPresentation,
  resolveSearchSyncControl,
  SEARCH_SYNC_STATUS_VOCABULARY,
  type SearchBackfillFacts,
  type SearchImportRuntimeFacts,
} from "./control-model";

const observability = {
  consecutiveDays: 7,
  deepHistoryMonths: { completed: 0, target: 16 },
  lastActivityAt: "2026-08-31T10:00:00.000Z",
  lastProbeAt: "2026-08-31T10:00:00.000Z",
  qualifyingDays: 7,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: false },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 20 * 60_000,
    expectedDayMs: 3 * 60_000,
    nextRequestInMs: 10 * 60_000,
    silenceMs: 10 * 60_000,
    thresholdMs: 30 * 60_000,
  },
  targetDays: 28,
} as const;

const runtime: SearchImportRuntimeFacts = {
  workerStatus: {
    status: "ok",
    temporalIdentityComparison: { detail: "identities match", status: "match" },
  },
};
const base: SearchBackfillFacts = {
  connectionStatus: "connected",
  observability,
  runtime,
  state: "running",
};

describe("search import presentation resolver", () => {
  it("uses pace-aware stall evidence instead of treating a ten-minute gap as universally stuck", () => {
    const slow = resolveSearchBackfillPresentation(base);
    expect(slow).toMatchObject({ kind: "running", title: "Running" });
    expect(slow.supportingText).toBe("Next request in about 10 min.");

    const fast = resolveSearchBackfillPresentation({
      ...base,
      observability: {
        ...observability,
        stall: {
          ...observability.stall,
          expectedBatchMs: 60_000,
          expectedDayMs: 60_000,
          nextRequestInMs: 0,
          thresholdMs: 60_000,
        },
      },
    });
    expect(fast).toMatchObject({ action: "retry", kind: "needs_retry", title: "Needs retry" });
    expect(fast.supportingText).toBe("No import activity for about 10 min.");
  });

  it("only renders a stall when every runtime predicate confirms it", () => {
    const mismatched = resolveSearchBackfillPresentation({
      ...base,
      observability: {
        ...observability,
        stall: { ...observability.stall, silenceMs: 31 * 60_000 },
      },
      runtime: {
        ...runtime,
        workerStatus: {
          status: "ok",
          temporalIdentityComparison: { detail: "different queues", status: "mismatch" },
        },
      },
    });
    expect(mismatched).toMatchObject({ kind: "waiting_worker", title: "Waiting on worker" });
  });

  it("renders an import row with no state and missing current coverage as needs retry", () => {
    const model = resolveSearchBackfillPresentation({
      ...base,
      runtime: { ...runtime },
      state: null,
    });
    expect(model).toMatchObject({ kind: "needs_retry", title: "Needs retry" });
    expect(model.title).not.toContain("delayed");
  });

  it("keeps our own durable state authoritative", () => {
    const queued = resolveSearchBackfillPresentation({
      ...base,
      runtime: { ...runtime },
      state: "queued",
    });
    const running = resolveSearchBackfillPresentation({
      ...base,
      runtime: { ...runtime },
      state: "running",
    });

    expect(queued).toMatchObject({ kind: "queued", title: "Queued" });
    expect(running).toMatchObject({ kind: "running", title: "Running" });
  });

  it("keeps a durable completion complete even when fewer than 28 days are available", () => {
    const model = resolveSearchBackfillPresentation({
      ...base,
      runtime: { ...runtime },
      state: "completed",
    });
    expect(model).toMatchObject({ action: null, kind: "complete", title: "Complete" });
  });

  it("uses a non-running semantic state for a durable completion", () => {
    expect(
      resolveSearchSyncControl({
        ...base,
        runtime: { ...runtime },
        state: "completed",
      }),
    ).toMatchObject({ semanticState: "complete", status: "Complete" });
  });

  it("does not complete from seven readable current days without a completed state", () => {
    const model = resolveSearchBackfillPresentation(base);
    expect(model).toMatchObject({ kind: "running", title: "Running" });
    expect(model.kind).not.toBe("complete");
  });

  it.each([
    [
      "no worker",
      { runtime: { workerStatus: "stale" } },
      "no_worker",
      "Waiting on worker",
      "Import is waiting for the background worker - restart it and it resumes.",
    ],
    [
      "behind another property",
      { queue: { blockingPropertyLabel: "example.com" } },
      "behind_import",
      "Queued",
      "Queued behind example.com. That import is using the shared property quota.",
    ],
    [
      "worker pickup",
      {},
      "worker_pickup",
      "Queued",
      "Queued for worker pickup. The worker checks pending work every few seconds.",
    ],
  ] as const)("derives queued reason for %s", (_name, overrides, reason, title, supportingText) => {
    const model = resolveSearchBackfillPresentation({ ...base, ...overrides, state: "queued" });
    expect(model).toMatchObject({ queueReason: reason, supportingText, title });
  });

  it.each([
    ["missing worker runtime", undefined],
    ["legacy ok worker status without identity proof", "ok"],
  ] as const)("derives no worker for %s", (_name, workerStatus) => {
    const model = resolveSearchBackfillPresentation({
      ...base,
      runtime: workerStatus ? { ...runtime, workerStatus } : undefined,
      state: "queued",
    });
    expect(model).toMatchObject({ kind: "waiting_worker", queueReason: "no_worker" });
  });

  it("keeps every rendered title inside the closed vocabulary", () => {
    const models = [
      resolveSearchBackfillPresentation(base),
      resolveSearchBackfillPresentation({ ...base, pausedReason: "user" }),
      resolveSearchBackfillPresentation({ ...base, pausedReason: "rate_limited" }),
      resolveSearchBackfillPresentation({ ...base, pausedReason: "needs_reauth" }),
      resolveSearchBackfillPresentation({ ...base, state: "waiting_for_first_data" }),
      resolveSearchBackfillPresentation({ ...base, state: "queued" }),
      resolveSearchBackfillPresentation({
        ...base,
        runtime: { ...runtime },
      }),
      resolveSearchBackfillPresentation({
        ...base,
        observability: {
          ...observability,
          readyThrough: { ...observability.readyThrough, d28: { current: true, previous: true } },
        },
        runtime: { ...runtime },
        state: "completed",
      }),
      resolveSearchBackfillPresentation({
        ...base,
        runtime: { ...runtime, workerStatus: "stale" },
        state: "queued",
      }),
      resolveSearchSyncControl({ connectionStatus: "not_connected" }),
      resolveSearchSyncControl({ connectionStatus: "connected_no_property" }),
    ];
    for (const model of models) {
      const title = "title" in model ? model.title : model.status;
      expect(SEARCH_SYNC_STATUS_VOCABULARY).toContain(title);
    }
    expect(SEARCH_SYNC_STATUS_VOCABULARY).not.toContain("Sync now");
  });
});
