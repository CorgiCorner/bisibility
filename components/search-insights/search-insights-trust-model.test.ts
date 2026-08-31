import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import { dateFromFrozenNow, isoFromFrozenNow } from "@/tests/clock";
import { describe, expect, it } from "vitest";
import {
  capHitClause,
  freshnessNote,
  importProgress,
  importRunningLine,
  importStartupPresentation,
  progressWidthClass,
} from "./search-insights-trust-model";

function importState(overrides: Partial<SearchInsightsImportState> = {}) {
  return {
    completedDays: 28,
    etaLabel: "about 3 days left (finishes ~Mon)",
    firstViewReady: true,
    lastActivityAt: isoFromFrozenNow({ hours: -7, minutes: -5 }),
    plannedRetentionMonths: 16,
    waiting: false,
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

describe("importProgress", () => {
  it("reads the sixteen months as months, because that is the promise being kept", () => {
    expect(importProgress(importState())).toEqual({
      completedDays: 28,
      daysTotal: 488,
      etaLabel: "about 3 days left (finishes ~Mon)",
      lastActivityAt: isoFromFrozenNow({ hours: -7, minutes: -5 }),
      monthsSaved: 1,
      percent: 6,
      state: "running",
    });
    expect(importRunningLine(importProgress(importState()), dateFromFrozenNow({ hours: -7 }))).toBe(
      "Importing your Google history · 28 of ~488 days · last activity 5m ago",
    );
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
      completedDays: 0,
      daysTotal: 0,
      etaLabel: null,
      lastActivityAt: null,
      monthsSaved: 0,
      percent: 0,
      state: "none",
    });
  });

  it("never reports progress the durable plan cannot hold", () => {
    const ahead = importProgress(importState({ completedDays: 600, daysDone: 1, daysTotal: 488 }));

    expect(ahead.percent).toBe(100);
    expect(ahead.monthsSaved).toBe(16);
    expect(
      importProgress(importState({ completedDays: 5, daysDone: 600, daysTotal: 0 })).percent,
    ).toBe(0);
  });

  it.each([3, 6, 12, 16])("scales months saved against the frozen %i-month plan", (months) => {
    expect(
      importProgress(
        importState({
          completedDays: 50,
          daysDone: 1,
          daysTotal: 100,
          plannedRetentionMonths: months,
        }),
      ).monthsSaved,
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
    const progress = importProgress(
      importState({
        completedDays: 0,
        daysTotal: 488,
        etaLabel: "about 3 days left",
        lastActivityAt: null,
      }),
    );

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
    expect(importStartupPresentation(importProgress(importState()), now)).toEqual({
      activity: "last activity 5m ago",
      eta: "about 3 days left (finishes ~Mon)",
      fact: "Importing your Google history · 28 of ~488 days",
      showHeartbeat: true,
      showProgress: true,
      state: "active",
    });
  });

  it("uses activity as phase C even before the completed-day counter advances", () => {
    const progress = importProgress(
      importState({
        completedDays: 0,
        etaLabel: null,
        lastActivityAt: isoFromFrozenNow({ hours: -7, minutes: -5 }),
      }),
    );

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
    const progress = importProgress(
      importState({ completedDays: 2, etaLabel: null, lastActivityAt: null }),
    );
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

describe("freshnessNote", () => {
  it("states the probe in the one zone the whole strip speaks", () => {
    expect(freshnessNote("2026-08-28T18:17:00.000Z")).toBe(
      "Fresh data through Aug 28, 11:17 Pacific. Google may still adjust these numbers before they finalize.",
    );
  });

  it("says a probe has not come back rather than inventing a timestamp", () => {
    expect(freshnessNote(null)).toBe("Waiting for the first data from Google.");
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
