import { describe, expect, it } from "vitest";
import { normalizeGscProperty } from "./gsc-property";

describe("normalizeGscProperty", () => {
  it("maps a bare domain to Google's canonical domain-property id", () => {
    expect(normalizeGscProperty("example.com")).toBe("sc-domain:example.com");
  });

  it("keeps canonical domain ids and canonicalizes URL-prefix properties", () => {
    expect(normalizeGscProperty("sc-domain:Example.com/")).toBe("sc-domain:example.com");
    expect(normalizeGscProperty("https://example.com")).toBe("https://example.com/");
    expect(normalizeGscProperty("https://example.com/blog")).toBe("https://example.com/blog/");
  });
});
