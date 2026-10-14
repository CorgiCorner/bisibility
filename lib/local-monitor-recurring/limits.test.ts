import { describe, expect, it } from "vitest";
import { assertRecurringQuote } from "./limits";
import { policy } from "./recurring.test-fixture";

describe("recurring native quote authority", () => {
  it("allows an exact final fractional-cent quote within all explicit limits", () =>
    expect(assertRecurringQuote(policy, policy.quote, "0.06", 1)).toBe("0.06"));
  it.each(["providerPriceVersion", "capabilityVersion", "adapterVersion", "provider"] as const)(
    "blocks changed %s",
    (field) =>
      expect(() =>
        assertRecurringQuote(policy, { ...policy.quote, [field]: "changed" }, "0", 0),
      ).toThrow("price_or_scope_changed"),
  );
  it("does not widen targets/options or purchase an unknown quote", () => {
    expect(() =>
      assertRecurringQuote(policy, { ...policy.quote, expectedTargetKeys: ["foreign"] }, "0", 0),
    ).toThrow();
    expect(() =>
      assertRecurringQuote(
        policy,
        { ...policy.quote, effectiveOptions: { surface: "finder" } },
        "0",
        0,
      ),
    ).toThrow();
    expect(() =>
      assertRecurringQuote(
        policy,
        { ...policy.quote, nativeEstimates: [{ unit: "cents", amount: null }] },
        "0",
        0,
      ),
    ).toThrow();
  });
  it("burns previously issued authority conservatively and denies total/count exhaustion", () => {
    expect(() => assertRecurringQuote(policy, policy.quote, "0.12", 1)).toThrow(
      "ceiling_exhausted",
    );
    expect(() => assertRecurringQuote(policy, policy.quote, "0", 2)).toThrow("ceiling_exhausted");
    expect(() =>
      assertRecurringQuote({ ...policy, maximumPerOccurrenceCents: "0.05" }, policy.quote, "0", 0),
    ).toThrow("ceiling_exhausted");
  });
});
