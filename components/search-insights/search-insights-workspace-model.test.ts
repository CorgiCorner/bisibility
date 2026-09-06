import { finalizedWindow } from "@/lib/search-insights/dates";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { describe, expect, it } from "vitest";
import { DOMAIN_TIP, PREFIX_TIP } from "./search-insights-copy";
import {
  exportLabel,
  periodOptions,
  periodTooltipLines,
  periodTriggerLabel,
  periodTriggerName,
  propertyTip,
  propertyTruncation,
  syncView,
  yearOverYearOption,
} from "./search-insights-workspace-model";

const importState = {
  capHitDays: 0,
  cursorDate: null,
  daysDone: 0,
  daysTotal: 480,
  earliestTargetDate: null,
  finalizedThroughDate: null,
  lastProbeAt: null,
  lastSyncStartedAt: null,
  newestFinalizedDate: null,
  pausedReason: null,
  state: "running",
};

const importFacts = {
  consecutiveDays: 0,
  deepHistoryMonths: { completed: 0, target: 16 },
  lastActivityAt: null,
  lastProbeAt: null,
  qualifyingDays: 0,
  readyThrough: {
    d1: { current: false, previous: false },
    d7: { current: false, previous: false },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 1,
    expectedDayMs: 60_000,
    nextRequestInMs: 0,
    silenceMs: 0,
    thresholdMs: 1,
  },
  targetDays: 28,
} satisfies ImportObservabilityFacts;

const previousComparison = { comparison: "previous_period" as const };

describe("propertyTruncation", () => {
  it("leaves a short name whole", () => {
    expect(propertyTruncation("example.com")).toEqual({ head: "example.com", tail: "" });
  });

  it("keeps the last twelve characters visible on a long name", () => {
    const { head, tail } = propertyTruncation("https://blog.example.com/docs/");
    expect(tail).toBe("le.com/docs/");
    expect(head).toBe("https://blog.examp");
    expect(head + tail).toBe("https://blog.example.com/docs/");
  });
});

describe("propertyTip", () => {
  it("explains that the two property kinds overlap", () => {
    expect(propertyTip("domain")).toBe(DOMAIN_TIP);
    expect(propertyTip("url-prefix")).toBe(PREFIX_TIP);
  });
});

describe("period", () => {
  it("labels the trigger with only the current window", () => {
    expect(
      periodTriggerLabel(
        {
          ...previousComparison,
          days: 7,
          id: "7",
          label: "7 finalized days",
        },
        finalizedWindow("2026-08-28", 7),
      ),
    ).toBe("Aug 22 - 28");
    expect(
      periodTriggerLabel(
        { ...previousComparison, days: 1, id: "1", label: "1 finalized day" },
        finalizedWindow("2026-08-28", 1),
      ),
    ).toBe("First look · Aug 28");
    expect(
      periodTriggerLabel(
        {
          ...previousComparison,
          days: 7,
          id: "7",
          label: "7 finalized days",
        },
        null,
      ),
    ).toBe("7 finalized days");
    expect(
      periodTriggerName(
        {
          ...previousComparison,
          days: 7,
          id: "7",
          label: "7 finalized days",
        },
        finalizedWindow("2026-07-08", 7),
      ),
    ).toBe("Comparison window: Jul 2 - 8");
    expect(
      periodTriggerName(
        { ...previousComparison, days: 1, id: "1", label: "1 finalized day" },
        finalizedWindow("2026-07-08", 1),
      ),
    ).toBe("Comparison window: First look, Jul 8");
    expect(
      periodTriggerName({
        ...previousComparison,
        days: 7,
        id: "7",
        label: "7 finalized days",
      }),
    ).toBe("Comparison window");
  });

  it("moves the comparison and Pacific boundary explanation into the tooltip", () => {
    expect(
      periodTooltipLines(
        {
          ...previousComparison,
          days: 7,
          id: "7",
          label: "7 finalized days",
        },
        finalizedWindow("2026-08-28", 7),
      ),
    ).toEqual([
      "Aug 22 - 28 · 7 finalized days",
      "compared with Aug 15 - 21",
      "Google finalizes days in Pacific time",
    ]);
  });

  it("shows only dated window preset options", () => {
    const options = periodOptions(null, "2026-08-28", {
      comparison: "previous_period",
      days: 7,
      id: "7",
      label: "7 finalized days",
    });

    expect(options.map((option) => option.id)).toEqual(["7", "28", "90"]);
    expect(options.map((option) => option.dates)).toEqual([
      "Aug 22 - 28",
      "Aug 1 - 28",
      "May 31 - Aug 28",
    ]);
  });

  it("puts the first look before dated unavailable presets", () => {
    const options = periodOptions(
      {
        ...importFacts,
        consecutiveDays: 1,
        readyThrough: {
          d1: { current: true, previous: false },
          d7: { current: false, previous: false },
          d28: { current: false, previous: false },
          d90: { current: false, previous: false },
        },
        stall: { ...importFacts.stall, expectedDayMs: 5 * 60_000 },
      },
      "2026-08-28",
      { ...previousComparison, days: 1, id: "1", label: "1 finalized day" },
    );

    expect(options).toEqual([
      {
        dates: "Aug 28",
        disabled: false,
        id: "1",
        label: "1 finalized day",
        sub: null,
      },
      {
        dates: "Aug 22 - 28",
        disabled: true,
        id: "7",
        label: "7 finalized days",
        sub: "ready in ~30 min",
      },
      {
        dates: "Aug 1 - 28",
        disabled: true,
        id: "28",
        label: "28 finalized days",
        sub: "ready in ~3 hr",
      },
      {
        dates: "May 31 - Aug 28",
        disabled: true,
        id: "90",
        label: "90 finalized days",
        sub: "ready in ~8 hr",
      },
    ]);
  });

  it("uses imported-history facts in the year-over-year toggle reason", () => {
    expect(
      yearOverYearOption(
        {
          comparison: "previous_period",
          days: 28,
          id: "28",
          label: "28 finalized days",
        },
        { monthsImported: 2, required: 13 },
        { ...importFacts, deepHistoryMonths: { completed: 0, target: 3 } },
      ),
    ).toEqual({
      checked: false,
      disabled: true,
      reason: "Needs 13 months of history · 0 of 3 imported",
    });
  });

  it("enables the year-over-year toggle once history is deep enough", () => {
    expect(
      yearOverYearOption(
        {
          comparison: "year_over_year",
          days: 7,
          id: "7",
          label: "7 finalized days",
        },
        { monthsImported: 13, required: 13 },
        { ...importFacts, deepHistoryMonths: { completed: 13, target: 16 } },
      ),
    ).toEqual({ checked: true, disabled: false, reason: null });
  });

  it.each([
    ["7", { d7: true, d28: false, d90: false }],
    ["28", { d7: false, d28: true, d90: false }],
    ["90", { d7: false, d28: false, d90: true }],
  ] as const)("enables only the selector-ready %s day window", (id, ready) => {
    const options = periodOptions(
      {
        ...importFacts,
        readyThrough: {
          d1: { current: ready.d7, previous: ready.d7 },
          d7: { current: ready.d7, previous: false },
          d28: { current: ready.d28, previous: false },
          d90: { current: ready.d90, previous: false },
        },
      },
      "2026-08-28",
      {
        ...previousComparison,
        days: Number(id),
        id,
        label: `${id} finalized days`,
      },
    );

    expect(options.filter((option) => !option.disabled).map((option) => option.id)).toEqual([id]);
  });

  it("uses the consecutive-day deficit and selector pace for a disabled period eta", () => {
    const options = (consecutiveDays: number, expectedDayMs: number) =>
      periodOptions(
        {
          ...importFacts,
          consecutiveDays,
          stall: { ...importFacts.stall, expectedDayMs },
        },
        "2026-08-28",
        {
          ...previousComparison,
          days: 7,
          id: "7",
          label: "7 finalized days",
        },
      );

    expect(options(4, 2 * 60_000).at(0)?.sub).toBe("ready in ~6 min");
    expect(options(5, 2 * 60_000).at(0)?.sub).toBe("ready in ~4 min");
    expect(options(4, 4 * 60_000).at(0)?.sub).toBe("ready in ~12 min");
  });

  it("keeps a positive eta when aggregate coverage still disables a complete period", () => {
    const option = periodOptions(
      {
        ...importFacts,
        consecutiveDays: 7,
        stall: { ...importFacts.stall, expectedDayMs: 5 * 60_000 },
      },
      "2026-08-28",
      { ...previousComparison, days: 7, id: "7", label: "7 finalized days" },
    ).at(0);

    expect(option).toMatchObject({ disabled: true, sub: "ready in ~5 min" });
  });
});

describe("syncView", () => {
  it("requires a property before offering a manual sync", () => {
    expect(syncView(null, "idle", false)).toEqual({
      disabled: true,
      label: "Sync now",
      title: "Connect a Search Console property first.",
    });
  });

  it("stands down while the backfill holds the queue", () => {
    expect(syncView(importState, "idle")).toEqual({
      disabled: true,
      label: "Sync now",
      title: expect.stringContaining("import is still running"),
    });
    expect(
      syncView({ ...importState, plannedRetentionMonths: 3, state: "running" }, "idle"),
    ).toEqual({
      disabled: true,
      label: "Sync now",
      title:
        "The 3-month import is still running. A manual sync queues behind it and would spend load quota twice.",
    });
    expect(syncView({ ...importState, state: "queued" }, "idle").label).toBe("Sync now");
    expect(
      syncView({ ...importState, pausedReason: "user", state: "paused" }, "idle"),
    ).toMatchObject({
      disabled: true,
      label: "Sync now",
      title: "Resume the history import before fetching new finalized data.",
    });
  });

  it.each([
    [
      "rate_limited",
      "The provider limit must reset before finalized data can be fetched. The import resumes automatically.",
    ],
    ["needs_reauth", "Reconnect Search Console before fetching new finalized data."],
    ["error", "Retry the history import before fetching new finalized data."],
  ] as const)("explains why Sync now stays disabled for a %s pause", (pausedReason, title) => {
    expect(syncView({ ...importState, pausedReason, state: "paused" }, "idle")).toEqual({
      disabled: true,
      label: "Sync now",
      title,
    });
  });

  it("states its cooldown after a run", () => {
    expect(syncView(null, "queued")).toEqual({
      disabled: true,
      label: "Sync now",
      title: expect.stringContaining("cooldown"),
    });
    expect(syncView(null, "cooldown").disabled).toBe(true);
  });

  it("invites a run when nothing is in flight", () => {
    expect(syncView({ ...importState, state: "completed" }, "idle")).toEqual({
      disabled: false,
      label: "Sync now",
      title: "Fetch anything Google has finalized since the last run.",
    });
  });

  it.each([
    [null, "idle", false],
    [importState, "idle", true],
    [{ ...importState, state: "queued" }, "idle", true],
    [{ ...importState, state: "paused" }, "idle", true],
    [null, "queued", true],
    [null, "cooldown", true],
    [null, "idle", true],
  ] as const)("keeps Sync now as the control label", (state, outcome, hasProperty) => {
    expect(syncView(state, outcome, hasProperty).label).toBe("Sync now");
  });
});

describe("exportLabel", () => {
  it("counts the rows the export will contain", () => {
    expect(exportLabel(1284)).toBe("Export CSV (1,284 rows)");
    expect(exportLabel(0)).toBe("Export CSV (0 rows)");
  });
});
