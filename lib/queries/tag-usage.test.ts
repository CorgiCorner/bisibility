import { describe, expect, it } from "vitest";
import { segmentCountByTag } from "./tag-usage";

describe("segmentCountByTag", () => {
  it("counts saved views that filter on each tag", () => {
    const counts = segmentCountByTag([
      { config: { filters: { tags: ["Docs", "Product"] } } },
      { config: { filters: { tags: ["docs"] } } },
      { config: { filters: { tags: ["Other"] } } },
    ]);

    expect(counts.get("docs")).toBe(2);
    expect(counts.get("product")).toBe(1);
    expect(counts.get("other")).toBe(1);
  });
});
