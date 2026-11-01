import { dataForSeoAccountAdapter } from "@/lib/providers/account-health/dataforseo";
import { serpApiAccountAdapter } from "@/lib/providers/account-health/serpapi";
import { describe, expect, it } from "vitest";
import { autoCheckEligible, nextAccountCheck } from "./cadence";

const start = new Date("2026-01-01T00:00:00Z");
const minute = 60_000;
const day = 1440 * minute;
const next = (age: number, attempt: number, random = 0.5, retryAt?: Date) =>
  nextAccountCheck({ startedAt: start, now: new Date(+start + age), attempt, random, retryAt });

describe("account check cadence", () => {
  it("uses 15m, 30m, 1h and 6h with 10 percent jitter", () => {
    expect(next(0, 0, 0)?.getTime()).toBe(+start + 13.5 * minute);
    expect(next(0, 1)?.getTime()).toBe(+start + 30 * minute);
    expect(next(0, 2)?.getTime()).toBe(+start + 60 * minute);
    expect(next(0, 3, 1)?.getTime()).toBe(+start + 396 * minute);
    expect(next(0, 20)?.getTime()).toBe(+start + 360 * minute);
  });
  it("switches at seven days, honors cooldown and stops at thirty days", () => {
    expect(next(7 * day, 4)?.getTime()).toBe(+start + 8 * day);
    expect(next(0, 0, 0.5, new Date(+start + day))?.getTime()).toBe(+start + day);
    expect(next(30 * day, 1)).toBeNull();
    expect(next(29.5 * day, 1)).toBeNull();
  });
  it("requires explicit non-billable capability and never polls invalid credentials", () => {
    expect(autoCheckEligible(dataForSeoAccountAdapter, "provider_billing")).toBe(true);
    expect(autoCheckEligible(dataForSeoAccountAdapter, "provider_auth")).toBe(false);
    expect(autoCheckEligible(serpApiAccountAdapter, "provider_billing")).toBe(false);
    expect(autoCheckEligible(undefined, "provider_billing")).toBe(false);
  });
});
