import { describe, expect, it } from "vitest";
import { exactExecutionEstimate } from "./execution-extension-estimate";

describe("execution extension estimate", () => {
  it("keeps exact four- and six-digit estimates within their columns", () => {
    expect(exactExecutionEstimate(0.0625, 4)).toBe("0.0625");
    expect(exactExecutionEstimate(99999999.9999, 4)).toBe("99999999.9999");
    expect(exactExecutionEstimate(0.000001, 6)).toBe("0.000001");
    expect(exactExecutionEstimate(999999999999, 6)).toBe("999999999999");
  });

  it("rejects rounding and integer-column overflow at both precisions", () => {
    for (const [value, fractionDigits] of [
      [0.00001, 4],
      [100000000, 4],
      [0.0000001, 6],
      [1000000000000, 6],
    ] as const) {
      expect(() => exactExecutionEstimate(value, fractionDigits)).toThrow(RangeError);
    }
  });
});
