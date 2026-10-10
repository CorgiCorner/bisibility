import { describe, expect, it } from "vitest";
import { aiTrackingOperationPolicy } from "./ai-tracking-policy";
import { aiTrackingPolicies } from "./operation-policy-ai-tracking";

describe("AI tracking operation scopes", () => {
  it("keeps previews, evidence exports and reads read scoped", () => {
    expect(
      aiTrackingOperationPolicy("POST", ["projects", "prj", "ai-tracking", "runs", "preview"]),
    ).toEqual({ name: "previewAiTrackingRun", scope: "read" });
    expect(
      aiTrackingOperationPolicy("GET", ["projects", "prj", "ai-tracking", "export"])?.scope,
    ).toBe("read");
  });
  it("declares read-only POST review and preview exceptions while generation remains write scoped", () => {
    expect(
      aiTrackingOperationPolicy("POST", ["projects", "prj", "ai-tracking", "suggestions"]),
    ).toEqual({ name: "suggestAiTrackingPrompts", scope: "read" });
    expect(
      aiTrackingOperationPolicy("POST", [
        "projects",
        "prj",
        "ai-tracking",
        "suggestions",
        "preview",
      ]),
    ).toEqual({ name: "aiTrackingSuggestionsPreview", scope: "read" });
    expect(
      aiTrackingOperationPolicy("POST", [
        "projects",
        "prj",
        "ai-tracking",
        "suggestions",
        "generate",
      ]),
    ).toEqual({ name: "aiTrackingSuggestionsGenerate", scope: "write" });
    expect(aiTrackingPolicies.suggestAiTrackingPrompts).toMatchObject({
      requiredScope: "read",
      projectAccess: "read",
    });
    expect(aiTrackingPolicies.aiTrackingSuggestionsPreview).toMatchObject({
      requiredScope: "read",
      projectAccess: "read",
    });
    expect(aiTrackingPolicies.aiTrackingSuggestionsGenerate).toMatchObject({
      requiredScope: "write",
      projectAccess: "write",
    });
  });
  it("makes all execution and catalog mutation operations write scoped", () => {
    expect(
      aiTrackingOperationPolicy("POST", ["projects", "prj", "ai-tracking", "runs"])?.scope,
    ).toBe("write");
    expect(
      aiTrackingOperationPolicy("DELETE", ["projects", "prj", "ai-tracking", "prompts", "aip"])
        ?.scope,
    ).toBe("write");
    expect(
      aiTrackingOperationPolicy("GET", [
        "projects",
        "prj",
        "ai-tracking",
        "prompts",
        "aip",
        "not-real",
      ]),
    ).toBeNull();
  });
});
