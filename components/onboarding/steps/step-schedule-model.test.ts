import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { describe, expect, it } from "vitest";
import { onboardingTrackingDefaultsSchema, withTrackingDefaults } from "./step-schedule-model";

const requiredDefaults = {
  devices: ["desktop"] as const,
  frequency: "daily" as const,
  locations: ["US"],
  projectId: "prj_1",
};

function projectDefaults(serpDepth?: 10 | 20 | 50 | 100): ProjectDefaultsInput {
  return {
    city: null,
    country: "United States",
    cronExpression: "0 6 * * *",
    device: "desktop",
    frequency: "daily",
    jitterMinutes: 60,
    projectId: "prj_1",
    serpDepth,
    timezone: "UTC",
  };
}

describe("onboarding tracking defaults", () => {
  it("defaults schema depth to Top 20", () => {
    const parsed = onboardingTrackingDefaultsSchema.parse(requiredDefaults);

    expect(parsed.frequency).toBe("daily");
    expect(parsed.serpDepth).toBe(20);
  });

  it("defaults missing onboarding tracking values to manual, mobile, and Top 20", () => {
    const defaults = withTrackingDefaults(undefined, { projectId: "prj_1" });

    expect(defaults.devices).toEqual(["mobile"]);
    expect(defaults.frequency).toBe("manual");
    expect(defaults.serpDepth).toBe(20);
  });

  it("preserves explicit project depth ahead of flow depth", () => {
    const defaults = withTrackingDefaults(projectDefaults(50), {
      projectId: "prj_1",
      serpDepth: 10,
    });

    expect(defaults.serpDepth).toBe(50);
  });

  it("preserves explicit flow depth when project depth is missing", () => {
    const defaults = withTrackingDefaults(projectDefaults(), { projectId: "prj_1", serpDepth: 10 });

    expect(defaults.serpDepth).toBe(10);
  });
});
