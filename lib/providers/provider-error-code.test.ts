import { describe, expect, it } from "vitest";
import {
  dominantErrorCode,
  isProviderErrorCode,
  PROVIDER_ERROR_CODES,
  type ProviderErrorCode,
} from "./provider-error-code";

describe("PROVIDER_ERROR_CODES", () => {
  it("exposes the four neutral taxonomy codes in order", () => {
    expect(PROVIDER_ERROR_CODES).toEqual([
      "provider_billing",
      "provider_auth",
      "provider_rate_limited",
      "provider_transient",
    ]);
  });
});

describe("isProviderErrorCode", () => {
  it("accepts members of the taxonomy", () => {
    expect(isProviderErrorCode("provider_billing")).toBe(true);
    expect(isProviderErrorCode("provider_transient")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isProviderErrorCode("provider_unknown")).toBe(false);
    expect(isProviderErrorCode(null)).toBe(false);
    expect(isProviderErrorCode(undefined)).toBe(false);
  });
});

describe("dominantErrorCode", () => {
  it("returns provider_transient for an empty iterable", () => {
    expect(dominantErrorCode([])).toBe("provider_transient");
  });

  it("picks billing over all others", () => {
    const codes: ProviderErrorCode[] = [
      "provider_transient",
      "provider_auth",
      "provider_billing",
      "provider_rate_limited",
    ];
    expect(dominantErrorCode(codes)).toBe("provider_billing");
  });

  it("picks auth when billing is absent", () => {
    expect(
      dominantErrorCode(["provider_transient", "provider_auth", "provider_rate_limited"]),
    ).toBe("provider_auth");
  });

  it("picks rate_limited when only transient and rate_limited remain", () => {
    expect(dominantErrorCode(["provider_transient", "provider_rate_limited"])).toBe(
      "provider_rate_limited",
    );
  });

  it("defaults to transient for a single transient code", () => {
    expect(dominantErrorCode(["provider_transient"])).toBe("provider_transient");
  });

  it("skips invalid codes and falls back to transient", () => {
    expect(dominantErrorCode(["bad_code" as ProviderErrorCode, "provider_billing"])).toBe(
      "provider_billing",
    );
    expect(dominantErrorCode(["bad_code" as ProviderErrorCode])).toBe("provider_transient");
  });
});
