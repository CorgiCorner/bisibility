import { describe, expect, it } from "vitest";
import { buildOnboardingStepHref, type OnboardingFlowState } from "./onboarding-fixtures";

describe("onboarding fixtures", () => {
  it("does not include keyword ids in step hrefs", () => {
    const href = buildOnboardingStepHref(5, {
      devices: ["desktop"],
      keywordIds: ["kw_1", "kw_2"],
      locations: ["US"],
      projectId: "prj_1",
      providerId: "serpapi",
    } as unknown as OnboardingFlowState);

    expect(href).toBe(
      "/onboarding?step=5&projectId=prj_1&providerId=serpapi&loc=US&device=desktop",
    );
    expect(href).not.toContain("keywordId");
  });
});
