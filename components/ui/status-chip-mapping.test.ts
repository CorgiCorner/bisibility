import { ITEM_STATUSES, RUN_STATUSES, type RunStatus } from "@/lib/rank-check/runs/contract";
import { describe, expect, it } from "vitest";
import { itemStatusChipPresentation, runStatusChipPresentation } from "./status-chip-mapping";

describe("status chip closed vocabulary", () => {
  it("maps every run status", () => {
    expect(RUN_STATUSES.map((status) => runStatusChipPresentation(status, null))).toEqual([
      { label: "Planned", messageKey: "planned", tone: "planned" },
      { label: "Blocked", messageKey: "blocked", tone: "attention" },
      { label: "Queued", messageKey: "queued", tone: "info" },
      { label: "Running", messageKey: "running", tone: "info" },
      { label: "Cancelling", messageKey: "cancelling", tone: "neutral" },
      { label: "Not confirmed", messageKey: "notConfirmed", tone: "neutral" },
      { label: "Cancelled", messageKey: "cancelled", tone: "neutral" },
    ]);
  });

  it.each([
    ["succeeded", { label: "Succeeded", messageKey: "succeeded", tone: "positive" }],
    ["partial", { label: "Partial", messageKey: "partial", tone: "attention" }],
    ["failed", { label: "Failed", messageKey: "failed", tone: "critical" }],
    ["deferred", { label: "Deferred", messageKey: "deferred", tone: "attention" }],
  ] as const)("uses the terminal outcome %s as the one run badge", (outcome, expected) => {
    expect(runStatusChipPresentation("completed", outcome)).toEqual(expected);
  });

  it("uses the run status as the one active badge", () => {
    expect(
      (["queued", "running", "cancelling"] as const).map((status) =>
        runStatusChipPresentation(status, null),
      ),
    ).toEqual([
      { label: "Queued", messageKey: "queued", tone: "info" },
      { label: "Running", messageKey: "running", tone: "info" },
      { label: "Cancelling", messageKey: "cancelling", tone: "neutral" },
    ]);
  });

  it("uses a neutral badge when a completed run has no confirmed outcome", () => {
    expect(runStatusChipPresentation("completed", null)).toEqual({
      label: "Not confirmed",
      messageKey: "notConfirmed",
      tone: "neutral",
    });
  });

  it("keeps a cancelled run terminal even if it has stale outcome data", () => {
    expect(runStatusChipPresentation("cancelled", "succeeded")).toEqual({
      label: "Cancelled",
      messageKey: "cancelled",
      tone: "neutral",
    });
  });

  it("does not expose a standalone outcome mapping", () => {
    expect(runStatusChipPresentation("completed", "succeeded")).toEqual({
      label: "Succeeded",
      messageKey: "succeeded",
      tone: "positive",
    });
  });

  it("maps every item status", () => {
    expect(ITEM_STATUSES.map(itemStatusChipPresentation)).toEqual([
      { label: "Queued", messageKey: "queued", tone: "info" },
      { label: "Running", messageKey: "running", tone: "info" },
      { label: "Completed", messageKey: "completed", tone: "positive" },
      { label: "Failed", messageKey: "failed", tone: "critical" },
      { label: "Deferred", messageKey: "deferred", tone: "attention" },
      { label: "Cancelled", messageKey: "cancelled", tone: "neutral" },
      { label: "Skipped", messageKey: "skipped", tone: "neutral" },
      { label: "Blocked", messageKey: "blocked", tone: "attention" },
    ]);
  });

  it("throws before an unknown run status can render", () => {
    expect(() => runStatusChipPresentation("outside-set" as RunStatus, null)).toThrowError(
      "Unknown run status: outside-set",
    );
  });
});
