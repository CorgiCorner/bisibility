import { ProviderAuthError } from "@/lib/providers/auth-error";
import { describe, expect, it } from "vitest";
import {
  chargedProviderCostCents,
  ProviderCallError,
  providerErrorCodeFromError,
} from "./call-error";

describe("ProviderCallError", () => {
  it("defaults code to provider_transient when not supplied", () => {
    expect(new ProviderCallError("boom").code).toBe("provider_transient");
  });

  it("accepts an explicit code in the constructor", () => {
    expect(new ProviderCallError("boom", null, "provider_billing").code).toBe("provider_billing");
  });

  it("allows mutating code after construction for adapter classification", () => {
    const error = new ProviderCallError("boom");
    error.code = "provider_auth";
    expect(error.code).toBe("provider_auth");
  });

  it("preserves costCents", () => {
    expect(new ProviderCallError("boom", 5).costCents).toBe(5);
    expect(new ProviderCallError("boom").costCents).toBeNull();
  });
});

describe("chargedProviderCostCents", () => {
  it("returns the cost for positive finite values", () => {
    expect(chargedProviderCostCents(new ProviderCallError("x", 7))).toBe(7);
  });

  it("returns null for zero, negative, or non-ProviderCallError", () => {
    expect(chargedProviderCostCents(new ProviderCallError("x", 0))).toBeNull();
    expect(chargedProviderCostCents(new ProviderCallError("x", -1))).toBeNull();
    expect(chargedProviderCostCents(new Error("x"))).toBeNull();
  });
});

describe("providerErrorCodeFromError", () => {
  it("reads the code field from a ProviderCallError", () => {
    const error = new ProviderCallError("x", null, "provider_billing");
    expect(providerErrorCodeFromError(error)).toBe("provider_billing");
  });

  it("returns provider_auth for a ProviderAuthError", () => {
    expect(providerErrorCodeFromError(new ProviderAuthError("primary"))).toBe("provider_auth");
  });

  it("defaults to provider_transient for unknown errors", () => {
    expect(providerErrorCodeFromError(new Error("random"))).toBe("provider_transient");
    expect(providerErrorCodeFromError(null)).toBe("provider_transient");
  });
});
