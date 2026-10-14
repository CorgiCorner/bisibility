import { overviewKeywordWhere } from "@/lib/queries/overview-filters";
import { describe, expect, it } from "vitest";
import { localOverviewKeywordWhere } from "./overview-scope";

const filters = {
  device: "mobile" as const,
  marketIds: ["location-1"],
  range: "28d" as const,
  tag: "priority",
};
describe("Local organic companion scope", () => {
  it("preserves original General where when Local is absent", () => {
    expect(localOverviewKeywordWhere("project", filters)).toEqual(
      overviewKeywordWhere("project", filters),
    );
  });
  it("keeps every filter plus exact full authorized IDs, including explicit empty", () => {
    for (const ids of [[], ["kw-first", "kw-second"]]) {
      expect(localOverviewKeywordWhere("project", filters, ids)).toEqual({
        projectId: "project",
        archivedAt: null,
        device: "mobile",
        locationId: { in: ["location-1"] },
        tags: { some: { tag: { name: "priority" } } },
        publicId: { in: ids },
        locationRef: {
          projectMarkets: { none: { projectId: "project", status: { not: "active" } } },
        },
      });
    }
  });
});
