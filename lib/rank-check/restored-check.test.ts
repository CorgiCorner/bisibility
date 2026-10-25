import { expect, it } from "vitest";
import { isRestoredCheck } from "./restored-check";

it("recognizes only an applied restore marker, including legacy missing values", () => {
  expect(isRestoredCheck({ recoveryRestoredAt: new Date("2026-10-24T07:00:00Z") })).toBe(true);
  expect(isRestoredCheck({ recoveryRestoredAt: null })).toBe(false);
  expect(isRestoredCheck({})).toBe(false);
});
