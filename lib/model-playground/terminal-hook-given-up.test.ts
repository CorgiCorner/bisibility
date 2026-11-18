import { expect, test } from "vitest";
import { modelTerminalHookGivenUp } from "./column-state";

test("given up requires the stop to name the current undelivered revision", () => {
  const stoppedAt = new Date("2026-01-01T00:00:00.000Z");
  expect(
    modelTerminalHookGivenUp({
      stoppedAt,
      stoppedRevision: 2,
      terminalRevision: 2,
      deliveredRevision: 1,
    }),
  ).toBe(true);
  expect(
    modelTerminalHookGivenUp({
      stoppedAt,
      stoppedRevision: 1,
      terminalRevision: 2,
      deliveredRevision: 2,
    }),
  ).toBe(false);
  expect(
    modelTerminalHookGivenUp({
      stoppedAt: null,
      stoppedRevision: 2,
      terminalRevision: 2,
      deliveredRevision: 1,
    }),
  ).toBe(false);
});
