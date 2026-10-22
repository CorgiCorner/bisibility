import { describe, expect, it } from "vitest";
import { RUN_OUTCOMES, RUN_STATUSES } from "./contract";
import { normalizeTerminalRunState } from "./terminal-state";

describe("terminal run state contract", () => {
  it.each(["completed", "cancelled"])(
    "normalizes legacy %s cancellation without touching facts",
    (status) => {
      expect(normalizeTerminalRunState({ status, outcome: "cancelled" })).toEqual({
        status: "cancelled",
        outcome: null,
      });
    },
  );
  it("preserves every currently valid status and outcome, including mixed cancellation", () => {
    for (const status of RUN_STATUSES)
      for (const outcome of [...RUN_OUTCOMES, null]) {
        expect(normalizeTerminalRunState({ status, outcome })).toEqual({ status, outcome });
      }
  });
  it.each([
    { status: "running", outcome: "cancelled" },
    { status: "completed", outcome: "unknown" },
    { status: "unknown", outcome: "cancelled" },
  ])("rejects unsupported state without guessing: %j", (input) => {
    expect(() => normalizeTerminalRunState(input)).toThrow();
  });
});
