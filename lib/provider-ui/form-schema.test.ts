import { describe, expect, it } from "vitest";
import {
  allocationFromInput,
  allocationInputIssue,
  dollarsFromNativeCents,
  nativeCentsFromDollars,
  parseNativeAllocation,
  parseNativeRateCents,
} from "./form-schema";

describe("provider UI exact decimal forms", () => {
  it("retains sub-cent rate precision and true zero without financial Number conversion", () => {
    expect(nativeCentsFromDollars("0.000001")).toBe("0.0001");
    expect(dollarsFromNativeCents("0.0001", 4)).toBe("0.000001");
    expect(nativeCentsFromDollars("0.000000")).toBe("0");
  });
  it("shares exact database bounds and rejects exponent or rounded overflow", () => {
    expect(parseNativeRateCents("999999.9999")).toBe("999999.9999");
    expect(parseNativeRateCents("1000000")).toBeNull();
    expect(parseNativeRateCents("0.00001")).toBeNull();
    expect(parseNativeRateCents("1e-4")).toBeNull();
    expect(nativeCentsFromDollars("9007199254740993.125")).toBe("900719925474099312.5");
  });
  it("reads an exact half-step median without widening writable rate precision", () => {
    expect(dollarsFromNativeCents("0.62505", 4)).toBe("0.0062505");
    expect(parseNativeRateCents("0.62505")).toBeNull();
    expect(nativeCentsFromDollars("0.0062505")).toBeNull();
  });
  it("keeps clear distinct from invalid native allocation input", () => {
    expect(allocationFromInput("", "cents")).toBeNull();
    expect(allocationFromInput("garbage", "cents")).toBeUndefined();
    expect(allocationFromInput("1000", "customer_cents")).toBe("1000");
    expect(allocationFromInput("0.01", "customer_cents")).toBeUndefined();
    expect(allocationFromInput("1000", "cents")).toBe("100000");
    expect(allocationFromInput("21474836.47", "cents")).toBe("2147483647");
    expect(allocationInputIssue("21474836.48", "cents")).toBe("tooLarge");
    expect(allocationInputIssue("1.5", "units")).toBe("wholeUnits");
    expect(parseNativeAllocation("0", "units")).toBeNull();
  });
});
