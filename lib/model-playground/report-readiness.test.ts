import { expect, test } from "vitest";
import { MODEL_IN_FLIGHT_MS } from "./admission-state";
import { isTerminalReportRun } from "./report-state";

const now = new Date("2026-11-13T12:00:00Z");
test.each([
  ["queued", null, null, false],
  ["claimed", null, null, false],
  ["completed", {}, null, true],
  ["partial", {}, null, true],
  ["failed", {}, null, true],
  ["cancelled", {}, null, true],
  ["unknown", {}, null, true],
  ["unknown", null, new Date(+now - MODEL_IN_FLIGHT_MS + 1), false],
  ["unknown", null, new Date(+now - MODEL_IN_FLIGHT_MS), true],
  ["unknown", null, null, false],
  ["unknown", null, new Date("invalid"), false],
  ["malformed", {}, null, false],
] as const)("report readiness: %s / %j / %s", (state, result, dispatchStartedAt, ready) => {
  expect(MODEL_IN_FLIGHT_MS).toBe(150_000);
  expect(isTerminalReportRun({ columns: [{ state, result, dispatchStartedAt }] }, now)).toBe(ready);
  expect(
    isTerminalReportRun(
      { columns: [{ state, result, dispatchStartedAt }, { state: "queued" }] },
      now,
    ),
  ).toBe(false);
});
