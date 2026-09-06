import { describe, expect, it } from "vitest";
import {
  ITEM_STATUSES,
  RUN_OUTCOMES,
  RUN_STATUSES,
  type RunCounts,
  SEND_UNCONFIRMED_REASON,
} from "./contract";
import {
  isTerminalItemStatus,
  isTerminalRunStatus,
  outcomeFromCounts,
  runItemStatusCopy,
  runOutcomeLabel,
  runStatusLabel,
  sendUnconfirmedItemCopy,
} from "./status";

function counts(overrides: Partial<RunCounts> = {}): RunCounts {
  return {
    requested: 3,
    total: 3,
    skipped: 0,
    completed: 0,
    failed: 0,
    deferred: 0,
    cancelled: 0,
    ...overrides,
  };
}

describe("run outcome table", () => {
  it.each([
    ["empty", counts({ requested: 0, total: 0 }), "deferred"],
    ["all completed", counts({ completed: 3 }), "succeeded"],
    ["completed with failures", counts({ completed: 1, failed: 2 }), "partial"],
    ["completed before cancellation", counts({ cancelled: 1, completed: 2 }), "partial"],
    ["all cancelled", counts({ cancelled: 3 }), "cancelled"],
    ["only failed", counts({ failed: 3 }), "failed"],
    ["only blocked", counts({ skipped: 3 }), "failed"],
    ["only deferred", counts({ deferred: 3 }), "deferred"],
  ] as const)("reports %s as %s", (_case, input, outcome) => {
    expect(outcomeFromCounts(input)).toBe(outcome);
  });
});

describe("unconfirmed send vocabulary", () => {
  it("never treats a send_unconfirmed item as a succeeded run", () => {
    expect(SEND_UNCONFIRMED_REASON).toBe("send_unconfirmed");
    expect(outcomeFromCounts(counts({ skipped: 3 }))).not.toBe("succeeded");
    expect(outcomeFromCounts(counts({ completed: 2, skipped: 1 }))).not.toBe("succeeded");
  });

  it("uses the accepted label and detail for send_unconfirmed", () => {
    expect(runItemStatusCopy("blocked", SEND_UNCONFIRMED_REASON)).toEqual({
      detail: [
        "We could not confirm this check was sent, so it was not retried.",
        "Run it again if you need it.",
      ].join(" "),
      label: "Not confirmed",
    });
    expect(runItemStatusCopy("failed", null)).toEqual({ detail: null, label: "Failed" });
    expect(sendUnconfirmedItemCopy.label).toBe("Not confirmed");
  });
});

describe("terminal status policy", () => {
  it("recognizes only terminal run statuses", () => {
    expect(RUN_STATUSES.filter(isTerminalRunStatus)).toEqual(["completed", "cancelled"]);
  });

  it("recognizes only terminal item statuses", () => {
    expect(ITEM_STATUSES.filter(isTerminalItemStatus)).toEqual([
      "completed",
      "failed",
      "deferred",
      "cancelled",
      "skipped",
      "blocked",
    ]);
  });
});

describe("run labels", () => {
  it("has a total run status label map", () => {
    expect(Object.keys(runStatusLabel)).toEqual(RUN_STATUSES);
    expect(runStatusLabel).toEqual({
      planned: "Planned",
      blocked: "Blocked",
      queued: "Queued",
      running: "Running",
      cancelling: "Cancelling",
      completed: "Completed",
      cancelled: "Cancelled",
    });
  });

  it("has a total run outcome label map", () => {
    expect(Object.keys(runOutcomeLabel)).toEqual(RUN_OUTCOMES);
    expect(runOutcomeLabel).toEqual({
      succeeded: "Succeeded",
      partial: "Partial",
      failed: "Failed",
      deferred: "Deferred",
    });
  });
});
