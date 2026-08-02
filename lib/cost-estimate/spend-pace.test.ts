import { FROZEN_NOW } from "@/tests/clock";
import { describe, expect, it } from "vitest";
import { projectedMonthlySpendCents } from "./spend-pace";

describe("projectedMonthlySpendCents", () => {
  it("projects month-end spend from elapsed UTC days", () => {
    expect(projectedMonthlySpendCents(1_500, FROZEN_NOW)).toBe(4_650);
  });

  it.each(["2026-07-01T23:00:00.000Z", "2026-07-02T23:00:00.000Z"])(
    "suppresses an unstable projection on %s",
    (now) => {
      expect(projectedMonthlySpendCents(1_500, new Date(now))).toBeNull();
    },
  );
});
