import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import type { SearchSyncControlFacts } from "@/lib/search-insights/sync/control-model";
import { resolveSearchSyncControl } from "@/lib/search-insights/sync/control-model";
import { describe, expect, it } from "vitest";
import { localizeSearchSyncControl } from "./search-sync-presentation";

const observability = {
  consecutiveDays: 7,
  deepHistoryMonths: { completed: 3, target: 16 },
  importCoverage: { completed: 7, total: 28 },
  lastActivityAt: "2026-08-31T10:00:00.000Z",
  lastProbeAt: "2026-08-31T10:00:00.000Z",
  qualifyingDays: 7,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
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

const baseFacts = {
  connectionStatus: "connected",
  observability,
  runtime: {
    workerStatus: {
      status: "ok",
      temporalIdentityComparison: { detail: "identities match", status: "match" },
    },
  },
  state: "running",
} satisfies SearchSyncControlFacts;

function present(facts: SearchSyncControlFacts) {
  const control = resolveSearchSyncControl(facts);
  return {
    control,
    presentation: localizeSearchSyncControl({
      control,
      dateDisplay: { dateFormat: "month_first", locale: "en", timeZone: DEFAULT_TIME_ZONE },
      facts,
      t: (key) => key,
    }),
  };
}

describe("localizeSearchSyncControl", () => {
  it.each([
    ["complete", { state: "completed" }, "complete", null],
    ["retry", { state: "failed" }, "needs_retry", "control.failedSupport"],
    [
      "provider pause",
      { pausedReason: "rate_limited", state: "paused" },
      "paused_provider",
      "control.quotaSupport",
    ],
    [
      "user pause",
      { pausedReason: "user", state: "paused" },
      "paused_user",
      "control.pausedSupport",
    ],
    ["queued", { state: "queued" }, "queued", "control.queuedSupport"],
    ["running", { state: "running" }, "running", "control.nextRequestIn"],
    [
      "runtime unknown",
      { runtime: { workerStatus: "unknown" }, state: "running" },
      "status_unavailable",
      "control.statusUnavailableSupport",
    ],
    [
      "first data",
      { state: "waiting_for_first_data" },
      "waiting_for_first_data",
      "control.waitingForDataSupport",
    ],
    [
      "stale worker",
      { runtime: { workerStatus: "stale" }, state: "running" },
      "waiting_worker",
      "control.delayedSupport",
    ],
    [
      "reauthentication",
      { connectionStatus: "needs_reauth", state: "paused" },
      "needs_reauth",
      "control.reconnectSupport",
    ],
  ] as const)("preserves the %s control branch", (_name, overrides, kind, supportingText) => {
    const { control, presentation } = present({ ...baseFacts, ...overrides });

    expect(control.kind).toBe(kind);
    expect(presentation).toMatchObject({
      action: control.action,
      kind,
      supportingText,
    });
  });

  it("uses the authoritative coverage selector for unknown and clamped running coverage", () => {
    const unknown = present({
      ...baseFacts,
      observability: { ...observability, importCoverage: { completed: 0, total: 0 } },
    });
    const clamped = present({
      ...baseFacts,
      observability: { ...observability, importCoverage: { completed: 99, total: 28 } },
    });

    expect(unknown.presentation.supportingText).toBe("control.nextRequestIn");
    expect(clamped.presentation.supportingText).toBe("control.allPlannedRunning");
    expect(clamped.presentation.action).toBe(clamped.control.action);
  });
});
