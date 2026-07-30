import { describe, expect, it } from "vitest";
import { comparableUrl, hasUrlMismatch } from "./url-mismatch";

describe("URL mismatch comparison", () => {
  it("resolves a target path against the observed ranking URL", () => {
    expect(comparableUrl("/features/rank-tracking", "https://example.com/blog")).toBe(
      "example.com/features/rank-tracking",
    );
    expect(
      hasUrlMismatch({
        position: 4,
        rankingUrl: "https://www.example.com/features/rank-tracking/",
        targetUrl: "/features/rank-tracking",
      }),
    ).toBe(false);
  });

  it("detects a genuinely different ranking URL", () => {
    expect(
      hasUrlMismatch({
        position: 4,
        rankingUrl: "https://example.com/blog/rank-tracking",
        targetUrl: "https://example.com/features/rank-tracking",
      }),
    ).toBe(true);
  });
});
