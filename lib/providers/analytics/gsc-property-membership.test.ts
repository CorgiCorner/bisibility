import { describe, expect, it } from "vitest";
import {
  assertGscPropertyUrl,
  GscPropertyUrlError,
  gscPropertyContainsUrl,
} from "./gsc-property-membership";

describe("Search Console property membership", () => {
  it.each([
    ["sc-domain:example.com", "http://example.com/", true],
    ["sc-domain:example.com", "https://example.com/", true],
    ["sc-domain:example.com", "https://a.b.example.com/page", true],
    ["sc-domain:example.com", "https://notexample.com/", false],
    ["sc-domain:example.com", "https://example.com.evil.net/", false],
    ["https://example.com/blog/", "https://example.com/blog/post", true],
    ["https://example.com/blog/", "https://another.example/blog/", false],
    ["https://example.com/blog/", "http://example.com/blog/post", false],
    ["https://example.com/blog/", "https://sub.example.com/blog/", false],
    ["https://example.com/blog/", "https://example.com/other/", false],
    ["https://example.com/blog/", "https://example.com/blogger/", false],
    ["https://example.com/blog/", "https://example.com/blog/../other/", false],
    ["sc-domain:example.com", "ftp://example.com/", false],
    ["sc-domain:example.com", "mailto:a@example.com", false],
    ["sc-domain:example.com", "https://[broken/", false],
    ["sc-domain:example.com", "example.com/page", false],
    ["sc-domain:example.com", "https:///example.com/", false],
    ["sc-domain:example.com", "https://example.com/space here", false],
    ["sc-domain:example.com", "https://example.com@evil.net/", false],
    ["sc-domain:example.com", "https://user:pass@example.com/", false],
    ["https://example.com/", "https://example.com:444/", false],
    ["example.com", "https://sub.example.com/", true],
    ["sc-domain:Example.com/", "https://EXAMPLE.com/", true],
  ])("%s contains %s: %s", (property, url, expected) => {
    expect(gscPropertyContainsUrl(property, url)).toBe(expected);
  });

  it("returns a typed client error", () => {
    expect(() => assertGscPropertyUrl("https://example.com/", "https://other.test/")).toThrow(
      GscPropertyUrlError,
    );
  });
});
