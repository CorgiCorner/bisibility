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
      label: "Backfill running",
      title: expect.stringContaining("backfill is still running"),
    });
    expect(syncView({ ...importState, state: "queued" }, "idle").label).toBe("Backfill running");
  });

  it("states its cooldown after a run", () => {
    expect(syncView(null, "started")).toEqual({
      disabled: true,
      label: "Synced, next in 5 min",
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
});

describe("exportLabel", () => {
  it("counts the rows the export will contain", () => {
    expect(exportLabel(1284)).toBe("Export CSV (1,284 rows)");
    expect(exportLabel(0)).toBe("Export CSV (0 rows)");
  });
});
