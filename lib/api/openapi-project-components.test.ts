import { READINESS_REASONS } from "@/lib/projects/readiness";
import { describe, expect, it } from "vitest";
import { projectSchemas } from "./openapi-project-components";

function readinessSchema() {
  return projectSchemas.Project.properties.readiness;
}

describe("Project readiness OpenAPI schema", () => {
  it("mirrors the closed readiness reason enum for every area", () => {
    const reason = readinessSchema().properties.serp.properties.reason;
    const areas = [
      readinessSchema().properties.backlinks,
      readinessSchema().properties.domain_overview,
      readinessSchema().properties.keyword_research,
      readinessSchema().properties.search_performance,
    ];

    expect(reason.enum).toEqual([...READINESS_REASONS, null]);
    for (const area of areas) {
      expect(area.properties.reason.enum).toEqual([...READINESS_REASONS, null]);
      expect(area.required).toEqual(["available", "reason"]);
    }
  });

  it("keeps the readiness block additive and self-describing", () => {
    expect(readinessSchema().required).toEqual([
      "token_scope",
      "write_mode",
      "serp",
      "backlinks",
      "domain_overview",
      "keyword_research",
      "search_performance",
    ]);
    expect(readinessSchema().properties.token_scope).toMatchObject({
      enum: ["read", "write"],
    });
    expect(readinessSchema().properties.write_mode).toMatchObject({
      enum: ["active", "migration_hold", "migrated"],
    });
    expect(projectSchemas.Project.required).not.toContain("readiness");
  });
});
