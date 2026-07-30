import { describe, expect, it } from "vitest";
import { dataForSeoQueuedEstimate, queuedBillingUnits } from "./queued-pricing";

describe("queued DataForSEO pricing", () => {
  it("accounts for top-100 as ten billable pages", () => {
    expect(queuedBillingUnits(100)).toBe(10);
  });

  it("uses the settled Standard High and Normal top-100 prices", () => {
    expect(dataForSeoQueuedEstimate("high", 100)).toBe(1.2);
    expect(dataForSeoQueuedEstimate("normal", 100)).toBe(0.6);
  });
});
