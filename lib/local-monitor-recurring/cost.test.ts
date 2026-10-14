import { describe, expect, it } from "vitest";
import {
  exactCents,
  formatCents,
  recurringCentsUsd,
  recurringQuoteCents,
  recurringUsdCents,
} from "./cost";
import { policy } from "./recurring.test-fixture";

describe("exact recurring ceilings", () => {
  it("retains fractional native cents and USD rather than floating point rounding", () => {
    expect(recurringCentsUsd("0.06")).toBe("0.0006");
    expect(recurringUsdCents("0.0006")).toBe("0.06");
    expect(formatCents(exactCents("0.06") + exactCents("0.06"))).toBe("0.12");
    expect(recurringCentsUsd("0.000000000000000001")).toBe("0.00000000000000000001");
  });
  it.each(["-1", "1e3", "00.6", "unknown", "0.1234567890123456789"])(
    "rejects malformed cost %s",
    (value) => expect(() => exactCents(value)).toThrow(),
  );
  it("never turns missing or unknown native amount into zero", () => {
    expect(() =>
      recurringQuoteCents({
        ...policy.quote,
        nativeEstimates: [{ unit: "USD", amount: "0.0006" }],
      }),
    ).toThrow();
    expect(() =>
      recurringQuoteCents({ ...policy.quote, nativeEstimates: [{ unit: "cents", amount: null }] }),
    ).toThrow();
  });
});
