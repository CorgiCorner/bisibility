import { describe, expect, it } from "vitest";
import {
  freshnessSecondsText,
  measurementFreshnessFormSchema,
  parseFreshnessSeconds,
} from "./freshness-input";

describe("explicit freshness duration input", () => {
  it("preserves blank as unknown and explicit zero as zero", () => {
    expect(parseFreshnessSeconds("  ")).toBeNull();
    expect(parseFreshnessSeconds("0")).toBe(0);
    expect(parseFreshnessSeconds("0,001")).toBe(1);
  });
  it.each([0, 1, 999, 1000, 86400000, Number.MAX_SAFE_INTEGER])(
    "round-trips retained milliseconds exactly: %s",
    (value) => {
      expect(parseFreshnessSeconds(freshnessSecondsText(value))).toBe(value);
    },
  );
  it.each(["-1", "1e4", "Infinity", "NaN", "0.0001", "9007199254740.992", "12junk"])(
    "rejects %s instead of rounding",
    (value) => {
      expect(() => parseFreshnessSeconds(value)).toThrow();
    },
  );
});

describe("shared client-safe freshness form validation", () => {
  it("accepts explicit unknown and zero without applying defaults", () => {
    expect(measurementFreshnessFormSchema.parse({ manualSeconds: "", graceSeconds: "0" })).toEqual({
      manualSeconds: "",
      graceSeconds: "0",
    });
  });
  it("marks the exact invalid field and rejects undeclared form intent", () => {
    const result = measurementFreshnessFormSchema.safeParse({
      manualSeconds: "-1",
      graceSeconds: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["manualSeconds"]);
    expect(
      measurementFreshnessFormSchema.safeParse({
        manualSeconds: "",
        graceSeconds: "",
        role: "owner",
      }).success,
    ).toBe(false);
  });
});
