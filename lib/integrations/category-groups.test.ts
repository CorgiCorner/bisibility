import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import { describe, expect, it } from "vitest";
import { groupIntegrationCategories } from "./category-groups";

describe("integration display groups", () => {
  it("shows three SEO providers together while retaining the two SERP capabilities", () => {
    const groups = groupIntegrationCategories(integrationCategories);
    expect(groups.map((group) => group.id)).toEqual(["serp", "analytics"]);
    const seo = groups[0].providers;
    expect(seo.map((provider) => provider.id)).toEqual(["dataforseo", "serpapi", "ahrefs"]);
    expect(
      seo.filter((provider) => provider.kind === "serp").map((provider) => provider.id),
    ).toEqual(["dataforseo", "serpapi"]);
    expect(seo[2].kind).toBe("enrichment");
    expect(integrationCategories).toHaveLength(3);
  });
});
