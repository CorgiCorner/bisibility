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

  it("normalizes IDN and punycode hosts to the same value", () => {
    expect(normalizeDomain("https://münich.example.com/path")).toBe("xn--mnich-kva.example.com");
    expect(normalizeDomain("xn--mnich-kva.example.com")).toBe("xn--mnich-kva.example.com");
  });

  it("keeps subdomain matching asymmetric", () => {
    expect(domainMatches("blog.example.com", "example.com")).toBe(true);
    expect(domainMatches("example.com", "blog.example.com")).toBe(false);
  });

  it("rejects malformed URLs instead of inventing a host", () => {
    expect(normalizeDomain("http://[invalid/path")).toBeNull();
  });
});
