import { describe, expect, it } from "vitest";
import { researchQuoteIsPriced, researchSelectionCost } from "./research-cost";

describe("research selection cost", () => {
  it("multiplies the server price by the selection and hides an unknown price", () => {
    expect(researchSelectionCost(0.01, 3)).toBeCloseTo(0.03);
    expect(researchSelectionCost(null, 3)).toBeNull();
    expect(researchSelectionCost(0.01, 0)).toBeNull();
  });

  it("shows a quote amount only when the estimate named a charge", () => {
    expect(
      researchQuoteIsPriced({
        certainty: "estimate",
        unit: { code: "USD", kind: "currency" },
        value: "0.2",
      }),
    ).toBe(true);
    expect(
      researchQuoteIsPriced({
        certainty: "free",
        unit: { code: "USD", kind: "currency" },
        value: "0",
      }),
    ).toBe(false);
    expect(researchQuoteIsPriced(undefined)).toBe(false);
  });
});
