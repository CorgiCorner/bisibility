import { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { searchInsightsWindowFilter } from "./window-filter";

const window = { end: "2026-07-08", start: "2026-06-11" };

describe("searchInsightsWindowFilter", () => {
  it("binds the project, the property, the search type and both day bounds", () => {
    const filter = searchInsightsWindowFilter("project_1", "sc-domain:example.com", window);

    expect(filter.values).toEqual([
      "project_1",
      "sc-domain:example.com",
      "web",
      "2026-06-11",
      "2026-07-08",
    ]);
    expect(filter.sql).toContain('"date" BETWEEN');
  });

  it("keeps its parameters straight when one statement uses it twice", () => {
    const filter = searchInsightsWindowFilter("project_1", "sc-domain:example.com", window);
    const statement = Prisma.sql`SELECT (SELECT 1 WHERE ${filter}) AS a, (SELECT 1 WHERE ${filter}) AS b`;

    expect(statement.values).toHaveLength(10);
    expect(statement.sql.match(/\?/g)).toHaveLength(10);
  });
});
