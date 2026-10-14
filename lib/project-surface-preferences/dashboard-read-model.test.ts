import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { describe, expect, it } from "vitest";
import {
  projectDashboardPreference,
  requireWritableDashboardPreference,
} from "./dashboard-read-model";

const selection = {
  scope: { kind: "keyword", id: "kw_abcdefghijklmnopqrstuvwx" },
  locationId: "biz_abcdefghijklmnopqrstuvwx",
  identityRevisionId: "retained-identity-4",
  assignmentRevision: 4,
};
const row = () => ({
  revision: 7,
  schemaVersion: 1,
  defaultPresetId: "local",
  defaultSavedViewId: null,
  defaultSavedViewPublicId: null,
  presentation: {
    schemaVersion: 1,
    localSelection: selection,
    layouts: { local: presetDashboardLayout("local") },
  },
});
describe("read-only dashboard preference projection", () => {
  it("preserves exact valid Local IDs, revisions and layouts", () => {
    const value = projectDashboardPreference(row(), "project");
    expect(value).toMatchObject({
      revision: 7,
      defaultPreset: "local",
      presentation: { localSelection: selection },
    });
    expect(value.presentation.layouts.local).toEqual(presetDashboardLayout("local"));
    expect(value.notice).toBeUndefined();
    expect(requireWritableDashboardPreference(value)).toBe(value);
  });
  it("retains proven Local identity when one same-version presentation layout is invalid", () => {
    const value = projectDashboardPreference(
      {
        ...row(),
        presentation: {
          ...row().presentation,
          layouts: { local: { ...presetDashboardLayout("local"), schemaVersion: 99 } },
        },
      },
      "project",
    );
    expect(value.presentation.localSelection).toEqual(selection);
    expect(value.defaultPreset).toBe("local");
    expect(value.notice).toEqual({ kind: "invalid_layout", scopeUnavailable: false });
    expect(() => requireWritableDashboardPreference(value)).toThrow();
  });
  it("does not reinterpret future-version IDs/layouts while preserving the actual record revision and scoped preset", () => {
    const value = projectDashboardPreference({ ...row(), schemaVersion: 2 }, "project");
    expect(value.revision).toBe(7);
    expect(value.defaultPreset).toBe("local");
    expect(value.presentation.localSelection).toBeUndefined();
    expect(value.presentation.layouts).toEqual({});
    expect(value.notice).toEqual({ kind: "unsupported_version", scopeUnavailable: true });
  });
  it("marks an invalid default unavailable rather than allowing a General aggregate", () => {
    const value = projectDashboardPreference(
      { ...row(), defaultPresetId: "future-local" },
      "project",
    );
    expect(value.notice).toEqual({ kind: "unavailable_default", scopeUnavailable: true });
  });
});
