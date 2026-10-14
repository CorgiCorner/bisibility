import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import { describe, expect, it } from "vitest";
import {
  dashboardLayoutFor,
  dashboardPresentationSchema,
  saveDashboardLayoutSchema,
} from "./dashboard-model";

describe("separate dashboard preferences", () => {
  const local = presetDashboardLayout("local");
  it("does not activate a saved Local layout as the default", () => {
    const preference = {
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      revision: 1,
      defaultPreset: "general" as const,
      presentation: dashboardPresentationSchema.parse({ schemaVersion: 1, layouts: { local } }),
    };
    expect(dashboardLayoutFor(preference).preset).toBe("general");
    expect(dashboardLayoutFor(preference, "local")).toEqual(local);
  });
  it("refuses table presentation and mismatched dashboard presets", () => {
    expect(dashboardPresentationSchema.safeParse(emptyTablePresentation).success).toBe(false);
    expect(
      dashboardPresentationSchema.safeParse({ schemaVersion: 1, layouts: { general: local } })
        .success,
    ).toBe(false);
  });
  it("refuses owner overrides or scheduler payloads", () => {
    const request = {
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      expectedRevision: 0,
      layout: local,
    };
    expect(
      saveDashboardLayoutSchema.safeParse({ ...request, userId: "another-person" }).success,
    ).toBe(false);
    expect(saveDashboardLayoutSchema.safeParse({ ...request, frequency: "daily" }).success).toBe(
      false,
    );
  });
});
