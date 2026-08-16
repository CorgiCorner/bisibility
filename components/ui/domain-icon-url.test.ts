import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDomainIconUrl } from "./domain-icon-url";

describe("buildDomainIconUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a domain icon URL that requests sz=32", () => {
    expect(buildDomainIconUrl({ domain: "example.com" })).toBe(
      "https://www.google.com/s2/favicons?domain=example.com&sz=32",
    );
  });

  it("always requests sz=32 regardless of the legacy size option", () => {
    expect(buildDomainIconUrl({ domain: "example.com", size: 64 })).toBe(
      "https://www.google.com/s2/favicons?domain=example.com&sz=32",
    );
  });

  it("returns null for an empty or invalid domain", () => {
    expect(buildDomainIconUrl({ domain: "   " })).toBeNull();
    expect(buildDomainIconUrl({ domain: "not a valid host" })).toBeNull();
    expect(buildDomainIconUrl({ domain: "mailto:hello@example.com" })).toBeNull();
  });

  it("normalizes full URLs and bare domains with paths to lowercase hosts", () => {
    expect(buildDomainIconUrl({ domain: "HTTPS://WWW.Example.COM/path?query=yes" })).toBe(
      "https://www.google.com/s2/favicons?domain=www.example.com&sz=32",
    );
    expect(buildDomainIconUrl({ domain: "Example.ORG/path" })).toBe(
      "https://www.google.com/s2/favicons?domain=example.org&sz=32",
    );
    expect(buildDomainIconUrl({ domain: "xn--bcher-kva.example/path" })).toBe(
      "https://www.google.com/s2/favicons?domain=xn--bcher-kva.example&sz=32",
    );
  });

  it("does not emit a URL when domain icons are opted out", () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_ICONS", "off");

    expect(buildDomainIconUrl({ domain: "example.com" })).toBeNull();
  });
});
