import { describe, expect, it } from "vitest";
import { pathnameScope, sectionScope } from "./page-scope";

describe("page scope", () => {
  it("keeps project-scoped pages and feeds off the market axis", () => {
    expect(sectionScope("/settings")).toBe("project");
    expect(sectionScope("/settings/tracking")).toBe("project");
    expect(sectionScope("/integrations")).toBe("project");
    expect(sectionScope("/install")).toBe("project");
    expect(sectionScope("/markets")).toBe("project");
    expect(sectionScope("/alerts")).toBe("project");
    expect(sectionScope("/timeline")).toBe("project");
  });

  it("treats pages that measure a market as market-scopable", () => {
    expect(sectionScope("/rank-tracker")).toBe("market");
    expect(sectionScope("/rank-tracker/kw_1")).toBe("market");
    expect(sectionScope("/dashboard")).toBe("market");
    expect(sectionScope("/competitors")).toBe("market");
  });

  it("treats the project root itself as project-scoped", () => {
    expect(sectionScope("")).toBe("project");
    expect(sectionScope("/")).toBe("project");
  });

  it("decides from a full pathname with the context segment already in it", () => {
    expect(pathnameScope("/app/prj_acme/m/pmkt_one/rank-tracker")).toBe("market");
    expect(pathnameScope("/app/prj_acme/m/pmkt_one/settings/tracking")).toBe("project");
  });
});
