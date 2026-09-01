import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { describe, expect, it } from "vitest";
import { DOMAIN_TIP, PREFIX_TIP } from "./search-insights-copy";
import {
  exportLabel,
  periodOptions,
  periodTriggerLabel,
  propertyTip,
  propertyTruncation,
  syncView,
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
  it("labels the trigger with the window and its comparison", () => {
    expect(
      periodTriggerLabel({ days: 28, id: "28", label: "28 finalized days", sub: "vs previous 28" }),
    ).toBe("28 finalized days / vs previous 28");
  });

  it("shows year over year as a disabled option with the import progress", () => {
    const options = periodOptions({ monthsImported: 9, required: 13 });

    expect(options.map((option) => option.id)).toEqual(["7", "28", "90", "yoy"]);
    expect(options.at(-1)).toEqual({
      disabled: true,
      id: "yoy",
      label: "Year over year",
      sub: "Needs 13 months of history / 9 of 16 imported",
    });
  });

  it.each([
    ["7", { d7: true, d28: false, d90: false }],
    ["28", { d7: false, d28: true, d90: false }],
    ["90", { d7: false, d28: false, d90: true }],
  ] as const)("enables only the selector-ready %s day window", (id, ready) => {
    const options = periodOptions(
      { monthsImported: 9, required: 13 },
      {
        ...importFacts,
        readyThrough: {
          d7: { current: ready.d7, previous: false },
          d28: { current: ready.d28, previous: false },
          d90: { current: ready.d90, previous: false },
        },
      },
    );

    expect(options.filter((option) => !option.disabled).map((option) => option.id)).toEqual([id]);
  });

  it("uses the consecutive-day deficit and selector pace for a disabled period eta", () => {
    const options = (consecutiveDays: number, expectedDayMs: number) =>
      periodOptions(
        { monthsImported: 9, required: 13 },
        {
          ...importFacts,
          consecutiveDays,
          stall: { ...importFacts.stall, expectedDayMs },
        },
      );

    expect(options(4, 2 * 60_000).at(0)?.sub).toBe("vs previous 7 / ready in ~6 min");
    expect(options(5, 2 * 60_000).at(0)?.sub).toBe("vs previous 7 / ready in ~4 min");
    expect(options(4, 4 * 60_000).at(0)?.sub).toBe("vs previous 7 / ready in ~12 min");
  });

  it("keeps a positive eta when aggregate coverage still disables a complete period", () => {
    const option = periodOptions(
      { monthsImported: 9, required: 13 },
      {
        ...importFacts,
        consecutiveDays: 7,
        stall: { ...importFacts.stall, expectedDayMs: 5 * 60_000 },
      },
    ).at(0);

    expect(option).toMatchObject({ disabled: true, sub: "vs previous 7 / ready in ~5 min" });
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
    expect(syncView(null, "started")).toEqual({
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
    [null, "started", true],
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
