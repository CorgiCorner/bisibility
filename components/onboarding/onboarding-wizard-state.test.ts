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
  it("starts new onboarding with mobile manual tracking defaults", () => {
    const draft = initialOnboardingDraft(null, {});

    expect(draft.addKeywords.devices).toEqual(["mobile"]);
    expect(draft.addKeywords.device).toBe("mobile");
    expect(draft.schedule.devices).toEqual(["mobile"]);
    expect(draft.schedule.device).toBe("mobile");
    expect(draft.schedule.frequency).toBe("manual");
  });

  it("preserves explicit flow devices", () => {
    const draft = initialOnboardingDraft(null, { devices: ["desktop"] });

    expect(draft.addKeywords.devices).toEqual(["desktop"]);
    expect(draft.addKeywords.device).toBe("desktop");
    expect(draft.schedule.devices).toEqual(["desktop"]);
    expect(draft.schedule.device).toBe("desktop");
  });

  it("restores the persisted project timezone when onboarding resumes", () => {
    const draft = initialOnboardingDraft({ ...project, timezone: "Europe/Madrid" }, flowState);

    expect(draft.schedule.timezone).toBe("Europe/Madrid");
  });

  it("uses UTC for a historical project without defaults", () => {
    const draft = initialOnboardingDraft(project, flowState);

    expect(draft.schedule.timezone).toBe("UTC");
  });
});
