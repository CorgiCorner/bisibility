import { ITEM_STATUSES, RUN_STATUSES, type RunStatus } from "@/lib/rank-check/runs/contract";
import { describe, expect, it } from "vitest";
import { itemStatusChipPresentation, runStatusChipPresentation } from "./status-chip-mapping";

describe("status chip closed vocabulary", () => {
  it("maps every run status", () => {
    expect(RUN_STATUSES.map((status) => runStatusChipPresentation(status, null))).toEqual([
      { label: "Planned", tone: "planned" },
      { label: "Blocked", tone: "attention" },
      { label: "Queued", tone: "info" },
      { label: "Running", tone: "info" },
      { label: "Cancelling", tone: "neutral" },
      { label: "Not confirmed", tone: "neutral" },
      { label: "Cancelled", tone: "neutral" },
    ]);
  });

  it.each([
    ["succeeded", { label: "Succeeded", tone: "positive" }],
    ["partial", { label: "Partial", tone: "attention" }],
    ["failed", { label: "Failed", tone: "critical" }],
    ["deferred", { label: "Deferred", tone: "attention" }],
  ] as const)("uses the terminal outcome %s as the one run badge", (outcome, expected) => {
    expect(runStatusChipPresentation("completed", outcome)).toEqual(expected);
  });

  it("uses the run status as the one active badge", () => {
    expect(
      (["queued", "running", "cancelling"] as const).map((status) =>
        runStatusChipPresentation(status, null),
      ),
    ).toEqual([
      { label: "Queued", tone: "info" },
      { label: "Running", tone: "info" },
      { label: "Cancelling", tone: "neutral" },
    ]);
  });

  it("uses a neutral badge when a completed run has no confirmed outcome", () => {
    expect(runStatusChipPresentation("completed", null)).toEqual({
      label: "Not confirmed",
      tone: "neutral",
    });
  });

  it("keeps a cancelled run terminal even if it has stale outcome data", () => {
    expect(runStatusChipPresentation("cancelled", "succeeded")).toEqual({
      label: "Cancelled",
      tone: "neutral",
    });
  });

  it("does not expose a standalone outcome mapping", () => {
    expect(runStatusChipPresentation("completed", "succeeded")).toEqual({
      label: "Succeeded",
      tone: "positive",
    });
  });

  it("maps every item status", () => {
    expect(ITEM_STATUSES.map(itemStatusChipPresentation)).toEqual([
      { label: "Queued", tone: "info" },
      { label: "Running", tone: "info" },
      { label: "Completed", tone: "positive" },
      { label: "Failed", tone: "critical" },
      { label: "Deferred", tone: "attention" },
      { label: "Cancelled", tone: "neutral" },
      { label: "Skipped", tone: "neutral" },
      { label: "Blocked", tone: "attention" },
    ]);
  });

  it("throws before an unknown run status can render", () => {
    expect(() => runStatusChipPresentation("outside-set" as RunStatus, null)).toThrowError(
      "Unknown run status: outside-set",
    );
  });
});
