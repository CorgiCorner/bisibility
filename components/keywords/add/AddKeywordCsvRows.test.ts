import { describe, expect, it } from "vitest";
import { buildDrawerCsvKeywordRows } from "./AddKeywordCsvRows";

const defaults = {
  city: null,
  device: "desktop" as const,
  location: "United States" as const,
  locationKey: "US",
  locationLabel: "United States",
  tags: [],
  targetUrl: undefined,
  trackingLocationKey: "US",
};

describe("buildDrawerCsvKeywordRows", () => {
  it("preserves topic and intent columns from drawer CSV imports", () => {
    const rows = buildDrawerCsvKeywordRows(
      "keyword,target_url,tags,country,device,topic,intent\nrank tracker,/rank,Core,GB,mobile,Product,commercial",
      defaults,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      device: "mobile",
      intent: "commercial",
      keyword: "rank tracker",
      location: "United Kingdom",
      tags: ["Core"],
      targetUrl: "/rank",
      topic: "Product",
    });
  });
});
