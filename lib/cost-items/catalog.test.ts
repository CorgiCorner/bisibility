import { describe, expect, it } from "vitest";
import { costCatalog } from "./catalog";

describe("cost catalog", () => {
  it("reuses provider identity and stores no prices", () => {
    const ahrefs = costCatalog().find((entry) => entry.key === "ahrefs");
    expect(ahrefs).toMatchObject({ kind: "seo_tool", logoDomain: "ahrefs.com", name: "Ahrefs" });
    expect(ahrefs?.plans.length).toBeGreaterThan(0);
    expect(costCatalog().some((entry) => entry.key === "local-sequence")).toBe(false);
    expect(JSON.stringify(costCatalog())).not.toMatch(/price|amount|\$/i);
  });
});
