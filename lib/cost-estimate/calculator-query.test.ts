import { describe, expect, it } from "vitest";
import {
  buildCostCalculatorHref,
  calculatorInputOverridesFromSearchParams,
} from "./calculator-query";

describe("cost calculator query contract", () => {
  it("round-trips onboarding volume without selecting a provider", () => {
    const href = buildCostCalculatorHref({
      depth: 50,
      devices: ["desktop", "mobile"],
      frequency: "weekly",
      keywordCount: 42,
      locationCount: 3,
    });

    expect(href).toBe(
      "/rank-tracking-cost-calculator?keywords=42&locations=3&devices=both&frequency=weekly&depth=50",
    );
    expect(href).not.toContain("provider");
    expect(href).not.toBeNull();

    const query = Object.fromEntries(new URL(href ?? "", "https://example.com").searchParams);
    expect(calculatorInputOverridesFromSearchParams(query)).toEqual({
      depth: 50,
      devices: "both",
      frequency: "weekly",
      keywordCount: 42,
      locationCount: 3,
    });
  });

  it("preserves a single mobile device", () => {
    const href = buildCostCalculatorHref({
      depth: 10,
      devices: ["mobile"],
      frequency: "daily",
      keywordCount: 5,
      locationCount: 1,
    });

    expect(href).toContain("devices=mobile");
  });

  it("clamps counts and ignores unsupported values", () => {
    expect(
      calculatorInputOverridesFromSearchParams({
        depth: "30",
        devices: "tablet",
        frequency: "hourly",
        keywords: "99999",
        locations: "0",
        provider: "serpapi",
      }),
    ).toEqual({ keywordCount: 1000, locationCount: 1 });
  });

  it("returns no override when no supported query input is present", () => {
    expect(calculatorInputOverridesFromSearchParams({ provider: "serpapi" })).toBeUndefined();
  });
});
