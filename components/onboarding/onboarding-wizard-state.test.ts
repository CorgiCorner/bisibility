import { describe, expect, it } from "vitest";
import { initialOnboardingDraft } from "./onboarding-wizard-state";

const flowState = { projectId: "prj_1", providerId: null };
const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_1",
};

describe("initialOnboardingDraft", () => {
  it("restores the persisted project timezone when onboarding resumes", () => {
    const draft = initialOnboardingDraft({ ...project, timezone: "Europe/Madrid" }, flowState);

    expect(draft.schedule.timezone).toBe("Europe/Madrid");
  });

  it("uses UTC for a historical project without defaults", () => {
    const draft = initialOnboardingDraft(project, flowState);

    expect(draft.schedule.timezone).toBe("UTC");
  });
});
