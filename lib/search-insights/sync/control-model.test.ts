import { describe, expect, it } from "vitest";
import {
  resolveSearchBackfillPresentation,
  resolveSearchSyncControl,
  SEARCH_SYNC_STATUS_VOCABULARY,
  type SearchBackfillFacts,
  type SearchImportRuntimeFacts,
  selectSearchImportCoverage,
} from "./control-model";

const observability = {
  importCoverage: { completed: 28, total: 488 },
  consecutiveDays: 28,
  deepHistoryMonths: { completed: 0, target: 16 },
  lastActivityAt: "2026-08-31T10:00:00.000Z",
  lastProbeAt: "2026-08-31T10:00:00.000Z",
  qualifyingDays: 28,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
    d28: { current: true, previous: true },
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
  it("keeps full day coverage active until the import itself completes", () => {
    const full = {
      ...base,
      observability: { ...observability, importCoverage: { completed: 488, total: 488 } },
    };
    expect(resolveSearchBackfillPresentation(full)).toMatchObject({
      title: "Importing",
      kind: "running",
      polling: true,
      supportingText: "All planned days are imported. Import is still running.",
    });
    expect(resolveSearchBackfillPresentation({ ...full, state: "completed" })).toMatchObject({
      title: "Completed",
      kind: "complete",
      polling: false,
    });
  });

  it.each([
    ["queued", { state: "queued" }, "Queued"],
    ["current import", { state: "running" }, "Importing"],
    ["user pause", { pausedReason: "user", state: "paused" }, "Paused"],
    ["quota wait", { pausedReason: "rate_limited", state: "paused" }, "Waiting for Google"],
    ["reauth", { pausedReason: "needs_reauth", state: "paused" }, "Reconnect required"],
    ["first data", { state: "waiting_for_first_data" }, "Waiting for data"],
    [
      "confirmed unavailable worker",
      { runtime: { workerStatus: "stale" }, state: "running" },
      "Delayed",
    ],
    ["failed state", { state: "failed" }, "Failed"],
    ["saved error pause", { pausedReason: "error", state: "paused" }, "Failed"],
    ["completed", { state: "completed" }, "Completed"],
    ["unrecognized durable state", { state: "resuming" }, "Status unavailable"],
  ] as const)("presents %s factually", (_name, overrides, title) => {
    expect(resolveSearchBackfillPresentation({ ...base, ...overrides }).title).toBe(title);
  });

  it.each([
    ["missing", undefined],
    ["unknown", { workerStatus: "unknown" }],
  ] as const)(
    "does not infer worker failure from %s runtime evidence",
    (_name, runtimeOverride) => {
      const model = resolveSearchBackfillPresentation({
        ...base,
        ...(runtimeOverride ? { runtime: runtimeOverride } : { runtime: undefined }),
        state: "running",
      });

      expect(model).toMatchObject({ kind: "status_unavailable", title: "Status unavailable" });
      expect(model.title).not.toBe("Delayed");
    },
  );

  it("uses only a positive liveness failure or identity mismatch for Delayed", () => {
    const mismatched = resolveSearchBackfillPresentation({
      ...base,
      runtime: {
        workerStatus: {
          status: "ok",
          temporalIdentityComparison: { detail: "different queues", status: "mismatch" },
        },
      },
    });

    expect(mismatched).toMatchObject({ kind: "waiting_worker", title: "Delayed" });
  });

  it("uses request pace only while current facts confirm an import is running", () => {
    expect(resolveSearchBackfillPresentation(base).supportingText).toBe(
      "Next request in about 10 min.",
    );
    expect(
      resolveSearchBackfillPresentation({
        ...base,
        observability: { ...observability, stall: { ...observability.stall, nextRequestInMs: 0 } },
      }).supportingText,
    ).toBe("Import is running.");
    expect(
      resolveSearchBackfillPresentation({ ...base, state: "queued" }).supportingText,
    ).not.toMatch(/worker pickup|every few seconds|60 seconds/i);
  });

  it("keeps safeError auxiliary instead of letting it select lifecycle", () => {
    const model = resolveSearchBackfillPresentation({
      ...base,
      safeError: "A previous request failed.",
      state: "running",
    });

    expect(model).toMatchObject({ kind: "running", title: "Importing" });
    expect(model.supportingText).not.toContain("previous request failed");
  });

  it("selects qualifying coverage rather than raw planned counters", () => {
    expect(selectSearchImportCoverage(base)).toEqual({ completed: 28, total: 488, unit: "days" });
    expect(
      resolveSearchBackfillPresentation({
        ...base,
        observability: { ...observability, importCoverage: { completed: 28, total: 488 } },
      }).description,
    ).toBe("28 of 488 finalized days are imported.");
  });

  it("keeps progress indeterminate when qualifying total is unknown", () => {
    const unknownTotal = {
      ...base,
      observability: { ...observability, importCoverage: { completed: 28, total: 0 } },
    };

    expect(selectSearchImportCoverage(unknownTotal)).toEqual({
      completed: 28,
      total: null,
      unit: "days",
    });
    expect(resolveSearchBackfillPresentation(unknownTotal).description).toBe(
      "Finalized import coverage is not available.",
    );
  });

  it("does not fall back to a readiness counter in older snapshots", () => {
    expect(
      selectSearchImportCoverage({
        observability: { ...observability, importCoverage: undefined },
      }),
    ).toEqual({ completed: null, total: null, unit: "days" });
  });

  it("keeps semantic state derived from the factual presentation", () => {
    expect(resolveSearchSyncControl({ ...base, state: "completed" })).toMatchObject({
      semanticState: "complete",
      status: "Completed",
    });
    expect(resolveSearchSyncControl({ ...base, state: "failed" })).toMatchObject({
      semanticState: "error",
      status: "Failed",
    });
  });

  it("keeps every title inside the closed factual vocabulary", () => {
    const models = [
      resolveSearchBackfillPresentation(base),
      resolveSearchBackfillPresentation({ ...base, state: "queued" }),
      resolveSearchBackfillPresentation({ ...base, state: "waiting_for_first_data" }),
      resolveSearchBackfillPresentation({ ...base, state: "failed" }),
      resolveSearchBackfillPresentation({ ...base, state: "completed" }),
      resolveSearchBackfillPresentation({ ...base, runtime: undefined }),
    ];
    for (const model of models) expect(SEARCH_SYNC_STATUS_VOCABULARY).toContain(model.title);
  });
});
