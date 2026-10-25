import { describe, expect, it } from "vitest";
import { promptTrackerOperationPolicy } from "./ai-tracking-policy";
import { promptResearchPolicies } from "./operation-policy-ai-tracking";

describe("Prompt Tracker operation scopes", () => {
  it("keeps previews, evidence exports and reads read scoped", () => {
    expect(
      promptTrackerOperationPolicy("POST", [
        "projects",
        "prj",
        "prompt-tracker",
        "runs",
        "preview",
      ]),
    ).toEqual({ name: "previewPromptTrackerRun", scope: "read" });
    expect(
      promptTrackerOperationPolicy("GET", ["projects", "prj", "prompt-tracker", "export"])?.scope,
    ).toBe("read");
  });
  it("declares read-only POST review and preview exceptions while generation remains write scoped", () => {
    expect(
      promptTrackerOperationPolicy("POST", ["projects", "prj", "prompt-research", "suggestions"]),
    ).toEqual({ name: "suggestPromptResearchPrompts", scope: "read" });
    expect(
      promptTrackerOperationPolicy("POST", [
        "projects",
        "prj",
        "prompt-research",
        "suggestions",
        "preview",
      ]),
    ).toEqual({ name: "promptResearchSuggestionsPreview", scope: "read" });
    expect(
      promptTrackerOperationPolicy("POST", [
        "projects",
        "prj",
        "prompt-research",
        "suggestions",
        "generate",
      ]),
    ).toEqual({ name: "promptResearchSuggestionsGenerate", scope: "write" });
    expect(promptResearchPolicies.suggestPromptResearchPrompts).toMatchObject({
      requiredScope: "read",
      projectAccess: "read",
    });
    expect(promptResearchPolicies.promptResearchSuggestionsPreview).toMatchObject({
      requiredScope: "read",
      projectAccess: "read",
    });
    expect(promptResearchPolicies.promptResearchSuggestionsGenerate).toMatchObject({
      requiredScope: "write",
      projectAccess: "write",
    });
  });
  it("makes all execution and catalog mutation operations write scoped", () => {
    expect(
      promptTrackerOperationPolicy("POST", ["projects", "prj", "prompt-tracker", "runs"])?.scope,
    ).toBe("write");
    expect(
      promptTrackerOperationPolicy("DELETE", [
        "projects",
        "prj",
        "prompt-tracker",
        "prompts",
        "aip",
      ])?.scope,
    ).toBe("write");
    expect(
      promptTrackerOperationPolicy("GET", [
        "projects",
        "prj",
        "prompt-tracker",
        "prompts",
        "aip",
        "not-real",
      ]),
    ).toBeNull();
  });
});
