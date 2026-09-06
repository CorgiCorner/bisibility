import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { dateFromFrozenNow, isoFromFrozenNow } from "@/tests/clock";
import { describe, expect, it } from "vitest";
import {
  capHitClause,
  freshnessPresentation,
  importObservabilityProgress,
  importProgress,
  importRunningLine,
  importStartupPresentation,
  progressWidthClass,
} from "./search-insights-trust-model";

function importState(overrides: Partial<SearchInsightsImportState> = {}) {
  return {
    plannedRetentionMonths: 16,
    capHitDays: 0,
    cursorDate: "2026-03-14",
    daysDone: 274,
    daysTotal: 488,
    earliestTargetDate: "2025-03-14",
    finalizedThroughDate: "2026-07-08",
    lastProbeAt: isoFromFrozenNow({ hours: -8, minutes: -40 }),
    lastSyncStartedAt: null,
    newestFinalizedDate: "2026-07-08",
    pausedReason: null,
    state: "running",
    ...overrides,
  } satisfies SearchInsightsImportState;
}
const observabilityFacts = {
  consecutiveDays: 93,
  deepHistoryMonths: { completed: 3, target: 16 },
  lastActivityAt: isoFromFrozenNow({ hours: -7, minutes: -5 }),
  lastProbeAt: isoFromFrozenNow({ days: -1, minutes: -5 }),
  qualifyingDays: 7,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 1,
    expectedDayMs: 1,
    nextRequestInMs: 0,
    silenceMs: 0,
    thresholdMs: 1,
  },
  targetDays: 10,
} satisfies ImportObservabilityFacts;
describe("importProgress", () => {
  it("reads the sixteen months as months, because that is the promise being kept", () => {
    const row = importState();
    expect(importProgress(row, observabilityFacts)).toEqual({
      consecutiveDays: 93,
      daysTotal: 488,
      earliestTargetDate: "2025-03-14",
      firstDataDate: null,
      lastActivityAt: observabilityFacts.lastActivityAt,
      monthsSaved: 3,
      newestFinalizedDate: "2026-07-08",
      percent: 19,
      state: "running",
    });
    expect(importProgress(row).lastActivityAt).toBeNull();
    expect(
      importRunningLine(importProgress(row, observabilityFacts), dateFromFrozenNow({ hours: -7 })),
    ).toBe("Importing your Google history · 93 of ~488 days · last activity 5m ago");
  });
  it.each([
    ["queued", "running"],
    ["running", "running"],
    ["paused", "paused"],
    ["failed", "paused"],
    ["completed", "done"],
  ])("shows %s as %s, so a limitation never reads as a failure", (state, expected) => {
    expect(importProgress(importState({ state })).state).toBe(expected);
  });
  it("shows nothing at all before an import row exists", () => {
    expect(importProgress(null)).toEqual({
      consecutiveDays: 0,
      daysTotal: 0,
      earliestTargetDate: null,
      firstDataDate: null,
      lastActivityAt: null,
      monthsSaved: 0,
      newestFinalizedDate: null,
      percent: 0,
      state: "none",
    });
  });
  it("never reports progress the durable plan cannot hold", () => {
    const ahead = importProgress(importState(), {
      ...observabilityFacts,
      deepHistoryMonths: { completed: 16, target: 16 },
    });
    expect(ahead.percent).toBe(100);
    expect(ahead.monthsSaved).toBe(16);
    expect(
      importProgress(importState({ daysTotal: 0 }), {
        ...observabilityFacts,
        deepHistoryMonths: { completed: 0, target: 0 },
      }).percent,
    ).toBe(0);
  });
  it.each([3, 6, 12, 16])("scales months saved against the frozen %i-month plan", (months) => {
    expect(
      importProgress(importState({ plannedRetentionMonths: months }), {
        ...observabilityFacts,
        deepHistoryMonths: { completed: Math.round(months / 2), target: months },
      }).monthsSaved,
    ).toBe(Math.round(months / 2));
  });
});
describe("importStartupPresentation", () => {
  const now = dateFromFrozenNow({ hours: -7 });
  it.each([null, importState({ daysTotal: 0 })])(
    "binds an absent or uncomputed plan to phase A",
    (row) => {
      expect(importStartupPresentation(importProgress(row), now)).toEqual({
        activity: null,
        eta: null,
        fact: "Waiting for the first data from Google · import starting",
        showHeartbeat: false,
        showProgress: false,
        state: "starting",
      });
    },
  );

  it("binds a truthful plan without activity to phase B", () => {
    const progress = importProgress(importState({ daysTotal: 488 }));
    expect(importStartupPresentation(progress, now)).toEqual({
      activity: null,
      eta: null,
      fact: "Waiting for the first data from Google · importing ~488 days of history",
      showHeartbeat: false,
      showProgress: false,
      state: "planned",
    });
  });

  it("binds activity to phase C with separately gated segments", () => {
    expect(
      importStartupPresentation(importProgress(importState(), observabilityFacts), now),
    ).toEqual({
      activity: "last activity 5m ago",
      eta: null,
      fact: "Importing your Google history · 93 of ~488 days",
      showHeartbeat: true,
      showProgress: true,
      state: "active",
    });
  });

  it("uses activity as phase C even before the completed-day counter advances", () => {
    const progress = importProgress(importState(), { ...observabilityFacts, consecutiveDays: 0 });

    expect(importStartupPresentation(progress, now)).toEqual({
      activity: "last activity 5m ago",
      eta: null,
      fact: "Importing your Google history · 0 of ~488 days",
      showHeartbeat: true,
      showProgress: true,
      state: "active",
    });
  });

  it("uses completed days as the phase C fallback without inventing activity or ETA", () => {
    const progress = importProgress(importState(), {
      ...observabilityFacts,
      consecutiveDays: 2,
      lastActivityAt: null,
    });
    const presentation = importStartupPresentation(progress, now);

    expect(presentation).toEqual({
      activity: null,
      eta: null,
      fact: "Importing your Google history · 2 of ~488 days",
      showHeartbeat: true,
      showProgress: true,
      state: "active",
    });
    expect(JSON.stringify(presentation)).not.toMatch(/0 of ~0|not yet|\. ·/);
  });

  it("renders the clamped provider data range for an active import", () => {
    const progress = importProgress(
      importState({
        earliestTargetDate: "2026-05-12",
        firstDataDate: "2026-04-01",
        newestFinalizedDate: "2026-07-07",
      }),
      { ...observabilityFacts, consecutiveDays: 2, lastActivityAt: null },
    );

    expect(importStartupPresentation(progress, now).fact).toBe(
      "Importing your Google history · May 12, 2026 to Jul 7, 2026",
    );
  });

  it("uses the dedicated waiting sentence without progress or promises", () => {
    const presentation = importStartupPresentation(
      importProgress(importState({ daysTotal: 0, state: "waiting_for_first_data" })),
      now,
    );

    expect(presentation).toEqual({
      activity: null,
      eta: null,
      fact: "Google has not reported any search data for this property yet. We check daily and will import automatically when it appears.",
      showHeartbeat: false,
      showProgress: false,
      state: "waiting_for_first_data",
    });
    expect(presentation.fact).not.toMatch(/0 of 0|completion|first-28/i);
    expect(presentation.eta).toBeNull();
  });
});

describe("progressWidthClass", () => {
  it("draws the bar in twelfths from the spacing scale", () => {
    expect(progressWidthClass(0)).toBe("w-0");
    expect(progressWidthClass(56)).toBe("w-7/12");
    expect(progressWidthClass(100)).toBe("w-full");
  });

  it("clamps a figure outside the scale rather than reaching past the track", () => {
    expect(progressWidthClass(-20)).toBe("w-0");
    expect(progressWidthClass(140)).toBe("w-full");
  });
});

describe("importObservabilityProgress", () => {
  it("keeps the readiness counter, deep history, and freshness in one selector-backed model", () => {
    expect(importObservabilityProgress(observabilityFacts, dateFromFrozenNow())).toEqual({
      deepHistory: "3 of 16 months",
      freshness: {
        label: "checked 1d ago",
        tooltip:
          "Last checked Jul 9, 15:55 Pacific. Google may adjust recent data until it finalizes.",
      },
      percent: 70,
      qualifyingCounter: "7 of 10 finalized days",
    });
  });

  it("announces the first look until the seven-day view is finalized", () => {
    const firstLookFacts = {
      ...observabilityFacts,
      consecutiveDays: 2,
      readyThrough: {
        ...observabilityFacts.readyThrough,
        d1: { current: true, previous: false },
        d7: { current: false, previous: false },
      },
      stall: { ...observabilityFacts.stall, expectedDayMs: 300_000 },
      targetDays: 28,
    } satisfies ImportObservabilityFacts;

    expect(importObservabilityProgress(firstLookFacts)?.qualifyingCounter).toBe(
      "First look ready · 7-day view in ~25 min",
    );
    expect(
      importObservabilityProgress({
        ...firstLookFacts,
        consecutiveDays: 1,
        stall: { ...firstLookFacts.stall, expectedDayMs: 900_000 },
      })?.qualifyingCounter,
    ).toBe("First look ready · 7-day view in ~2 hr");
    expect(
      importObservabilityProgress({
        ...firstLookFacts,
        consecutiveDays: 7,
      })?.qualifyingCounter,
    ).toBe("First look ready · 7-day view once its days finalize");
    expect(
      importObservabilityProgress({
        ...firstLookFacts,
        consecutiveDays: 10,
      })?.qualifyingCounter,
    ).toBe("First look ready · 7-day view once its days finalize");
    expect(
      importObservabilityProgress({
        ...firstLookFacts,
        readyThrough: {
          ...firstLookFacts.readyThrough,
          d7: { current: true, previous: true },
        },
      })?.qualifyingCounter,
    ).toBe("7 of 28 finalized days");
    expect(
      importObservabilityProgress({
        ...firstLookFacts,
        readyThrough: {
          ...firstLookFacts.readyThrough,
          d1: { current: false, previous: false },
        },
      })?.qualifyingCounter,
    ).toBe("7 of 28 finalized days");
  });

  it("changes deep-history progress when the selector target changes", () => {
    expect(
      importObservabilityProgress(
        { ...observabilityFacts, deepHistoryMonths: { completed: 3, target: 12 } },
        dateFromFrozenNow(),
      )?.deepHistory,
    ).toBe("3 of 12 months");
  });

  it("keeps visible freshness compact and preserves probe detail in the tooltip", () => {
    expect(freshnessPresentation(null)).toEqual({
      label: "Waiting for the first data from Google.",
      tooltip: "Finalized days appear here once the first sync lands.",
    });
  });
});

describe("capHitClause", () => {
  it("names the truncation, because it is not the privacy filter", () => {
    expect(capHitClause(3)).toBe(", and this property hit Google's row ceiling on 3 days");
    expect(capHitClause(1)).toBe(", and this property hit Google's row ceiling on 1 day");
  });

  it("stays silent when no day was truncated", () => {
    expect(capHitClause(0)).toBe("");
  });
});
