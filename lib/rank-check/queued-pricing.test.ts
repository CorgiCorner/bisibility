import { beforeEach, describe, expect, it, vi } from "vitest";
import { dataForSeoQueuedEstimate, queuedBillingUnits } from "./queued-pricing";

describe("queued DataForSEO pricing", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  });
  it("accounts for top-100 as ten billable pages", () => {
    expect(queuedBillingUnits(100)).toBe(10);
  });

  it("uses the settled Standard High and Normal top-100 prices", () => {
    expect(dataForSeoQueuedEstimate("high", 100)).toBe(1.2);
    expect(dataForSeoQueuedEstimate("normal", 100)).toBe(0.6);
  });

  it("includes keyword operators in the actual task price", () => {
    expect(dataForSeoQueuedEstimate("normal", 10, "site:example.com")).toBe(0.3);
    expect(dataForSeoQueuedEstimate("high", 10, "site:example.com")).toBe(0.6);
  });
});
