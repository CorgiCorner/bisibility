import { expect, it } from "vitest";
import { previousFullHistoryMonths } from "./history-window";

it.each([
  [12, "2026-01-01T00:00:00Z", "2025-01-01", "2025-12-31"],
  [6, "2024-03-01T00:00:00Z", "2023-09-01", "2024-02-29"],
  [12, "2026-10-01T00:00:00+02:00", "2025-09-01", "2026-08-31"],
] as const)("freezes %i full UTC months at %s", (months, instant, dateFrom, dateTo) => {
  const window = previousFullHistoryMonths(months, new Date(instant));
  expect(window).toEqual({ dateFrom, dateTo });
  expect(Object.isFrozen(window)).toBe(true);
});
