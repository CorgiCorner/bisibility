import { describe, expect, it } from "vitest";
import { searchModuleConsumerStatus } from "./provider-consumer-status";

const observability = {
  importCoverage: { completed: 5, total: 488 },
  consecutiveDays: 5,
  deepHistoryMonths: { completed: 0, target: 16 },
  lastActivityAt: "2026-08-31T10:00:00.000Z",
  lastProbeAt: "2026-08-31T10:00:00.000Z",
  qualifyingDays: 5,
  readyThrough: {
    d1: { current: false, previous: false },
    d7: { current: false, previous: false },
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

const runtime = {
  workerStatus: {
    status: "ok" as const,
    temporalIdentityComparison: { detail: "identities match", status: "match" as const },
  },
};
const base = {
  connectionStatus: "connected" as const,
  observability,
  pausedReason: null,
  property: "sc-domain:example.com",
  runtime,
  state: "running",
};
const counter = `${observability.importCoverage.completed} of ${observability.importCoverage.total} finalized days are imported.`;

describe("searchModuleConsumerStatus", () => {
  it("adapts the shared importing presentation with its selector counter and support", () => {
    expect(searchModuleConsumerStatus(base)).toEqual({
      detail: "example.com",
      state: "backfill_running",
      summary: `Importing · ${counter} · Next request in about 10 min.`,
    });
  });

  it("uses the shared queued presentation without inferring worker activity", () => {
    expect(
      searchModuleConsumerStatus({
        ...base,
        queue: { blockingPropertyLabel: "example.com" },
        state: "queued",
      }),
    ).toMatchObject({
      state: "backfill_running",
      summary: `Queued · ${counter} · Import is queued.`,
    });
  });

  it("preserves readable URL-prefix properties", () => {
    expect(
      searchModuleConsumerStatus({ ...base, property: "https://example.com/docs/search/" }),
    ).toMatchObject({ detail: "https://example.com/docs/search/" });
  });

  it("omits an unavailable counter before selector facts exist", () => {
    expect(
      searchModuleConsumerStatus({
        connectionStatus: "not_connected",
        observability: undefined,
        property: null,
        state: null,
      }),
    ).toEqual({
      state: "needs_reauth",
      summary: "Reconnect required · Reconnect Search Console to continue importing.",
    });
  });

  it("does not substitute recent readiness for missing full import coverage", () => {
    expect(
      searchModuleConsumerStatus({
        ...base,
        observability: { ...observability, importCoverage: undefined },
      }),
    ).toMatchObject({
      state: "backfill_running",
      summary:
        "Importing · Finalized import coverage is not available. · Next request in about 10 min.",
    });
  });

  it("does not invent an import state before the active property has a row", () => {
    expect(
      searchModuleConsumerStatus({
        connectionStatus: "connected",
        observability: undefined,
        property: "sc-domain:example.com",
        state: null,
      }),
    ).toEqual({ detail: "example.com", state: "not_configured", summary: "Not configured" });
  });

  it("reports the first view ready when the first finalized day is ready", () => {
    expect(
      searchModuleConsumerStatus({
        ...base,
        observability: {
          ...observability,
          readyThrough: { ...observability.readyThrough, d1: { current: true, previous: false } },
        },
      }),
    ).toMatchObject({ state: "first_view_ready", summary: expect.stringMatching(/^Importing ·/) });
  });

  it("uses durable completion rather than assuming every property has four weeks of history", () => {
    expect(
      searchModuleConsumerStatus({
        ...base,
        observability: { ...observability, importCoverage: { completed: 5, total: 5 } },
        runtime: { ...runtime },
        state: "completed",
      }),
    ).toMatchObject({
      state: "kept_current",
      summary: "Completed · 5 of 5 finalized days are imported.",
    });
  });

  it.each([
    [
      "provider pause",
      { pausedReason: "rate_limited", state: "paused" },
      "Waiting for Google",
      "Google will resume the import automatically when its limit allows.",
      "backfill_running",
    ],
    [
      "failed import",
      { safeError: "Import failed", state: "failed" },
      "Failed",
      "Import failed",
      "sync_failed",
    ],
    [
      "waiting worker",
      { runtime: { ...runtime, workerStatus: "stale" } },
      "Delayed",
      "The active worker is unavailable or does not match this import.",
      "backfill_running",
    ],
  ] as const)(
    "keeps the shared %s presentation visible",
    (_name, overrides, title, support, state) => {
      const status = searchModuleConsumerStatus({ ...base, ...overrides });

      expect(status).toMatchObject({ state, summary: `${title} · ${counter} · ${support}` });
      expect(status.summary).not.toMatch(/^Importing|Not configured/);
    },
  );
});
