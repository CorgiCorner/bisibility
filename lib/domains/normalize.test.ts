import { describe, expect, it } from "vitest";
import { domainMatches, normalizeDomain } from "./normalize";

describe("domain normalization", () => {
  it("normalizes URLs, casing, www, paths, and trailing dots consistently", () => {
    expect(normalizeDomain(" HTTPS://WWW.Example.COM./path ")).toBe("example.com");
    expect(normalizeDomain("www.Example.com./path")).toBe("example.com");
    expect(normalizeDomain("  ")).toBeNull();
  });

  it("matches a domain and its subdomains", () => {
    expect(domainMatches("shop.example.com.", "https://example.com")).toBe(true);
    expect(domainMatches("notexample.com", "example.com")).toBe(false);
  });
});
