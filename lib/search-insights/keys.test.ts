import { dimensionKeyHash, searchInsightsPropertyKey } from "@/lib/search-insights/keys";
import { describe, expect, it } from "vitest";

describe("dimensionKeyHash", () => {
  it("is deterministic and hex encoded", () => {
    const first = dimensionKeyHash(["example query"]);
    expect(first).toBe(dimensionKeyHash(["example query"]));
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(first).toBe("5e412b55ab3401c3cd4b54a6d8ae850a8b83361f2c90c86642a563239131e316");
  });

  it("differs when the parts are swapped", () => {
    const query = "shoes";
    const page = "https://example.com/shoes";
    expect(dimensionKeyHash([query, page])).not.toBe(dimensionKeyHash([page, query]));
    expect(dimensionKeyHash([query, page])).toBe(
      "acca0f2a11c2fa7cb71db52961d8c3884a792d1591de53814c6884a8d9148965",
    );
  });

  it("separates parts so a shifted boundary cannot collide", () => {
    expect(dimensionKeyHash(["ab", "c"])).not.toBe(dimensionKeyHash(["a", "bc"]));
    expect(dimensionKeyHash(["ab", "c"])).toBe(
      "6c032e631d39a14d85aff7e319546af701e26c97b57ca95fbfe9c6ba855f67bf",
    );
  });

  it("distinguishes an empty trailing part from a missing one", () => {
    expect(dimensionKeyHash(["example.com", ""])).not.toBe(dimensionKeyHash(["example.com"]));
  });
});

describe("searchInsightsPropertyKey", () => {
  it("returns the same key for every spelling of one stored property", () => {
    expect(searchInsightsPropertyKey("sc-domain:example.com")).toBe("sc-domain:example.com");
    expect(searchInsightsPropertyKey("SC-Domain:Example.com/")).toBe("sc-domain:example.com");
    expect(searchInsightsPropertyKey(" example.com ")).toBe("sc-domain:example.com");
  });

  it("closes a url prefix property the way the provider stores it", () => {
    expect(searchInsightsPropertyKey("https://blog.example.com/docs")).toBe(
      "https://blog.example.com/docs/",
    );
  });

  it("has no key for a value that is not a property", () => {
    expect(searchInsightsPropertyKey("not a property")).toBeNull();
    expect(searchInsightsPropertyKey("")).toBeNull();
  });
});
