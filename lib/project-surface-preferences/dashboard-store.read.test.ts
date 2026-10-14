import { AuthorizationError } from "@/lib/auth/authorize";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import type { ViewDatabase } from "@/lib/saved-views/access";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readDashboardPreferenceFor,
  saveDashboardLayoutFor,
  saveDashboardLocalSelectionFor,
  setDashboardDefaultFor,
} from "./dashboard-store";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), write: vi.fn(), read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn(), writeAuditFailure: vi.fn() }));
vi.mock("./store", () => ({ preferenceScope: mocks.scope, writePreferenceCas: mocks.write }));
const projectId = "prj_abcdefghijklmnopqrstuvwx";
const context = sessionSavedViewContext({ id: "viewer" });
const db = {
  $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
    run({ userProjectSurfacePreference: { findUnique: mocks.read } }),
} as unknown as ViewDatabase;
const row = () => ({
  schemaVersion: 1,
  revision: 7,
  defaultSavedViewId: null,
  defaultSavedViewPublicId: null,
  defaultPresetId: "local",
  presentation: { schemaVersion: 1, layouts: {} },
});
describe("dashboard persisted read recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue({
      userId: "viewer",
      actor: { id: "viewer" },
      project: { id: "db-project", publicId: projectId },
    });
    mocks.read.mockResolvedValue(row());
  });
  it("reads an unsupported version with its actual scope/revision and a notice without a write", async () => {
    mocks.read.mockResolvedValue({ ...row(), schemaVersion: 2 });
    const value = await readDashboardPreferenceFor(context, projectId, db);
    expect(value).toMatchObject({
      projectId,
      revision: 7,
      defaultPreset: "local",
      notice: { kind: "unsupported_version" },
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("retains independently valid layouts when another stored layout is unsupported", async () => {
    mocks.read.mockResolvedValue({
      ...row(),
      presentation: {
        schemaVersion: 1,
        layouts: {
          general: presetDashboardLayout(),
          local: {
            schemaVersion: 1,
            preset: "local",
            widgets: [{ id: "retired_widget", span: "standard", visible: true }],
          },
        },
      },
    });
    const value = await readDashboardPreferenceFor(context, projectId, db);
    expect(value.revision).toBe(7);
    expect(value.defaultPreset).toBe("local");
    expect(value.presentation.layouts.general).toEqual(presetDashboardLayout());
    expect(value.presentation.layouts.local).toBeUndefined();
    expect(value.notice?.kind).toBe("invalid_layout");
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each(["default", "layout", "local"])(
    "rejects %s writes before touching an unsupported version",
    async (kind) => {
      mocks.read.mockResolvedValue({ ...row(), schemaVersion: 2 });
      const operation =
        kind === "local"
          ? saveDashboardLocalSelectionFor(
              { projectId, expectedRevision: 7, selection: null },
              context,
              db,
            )
          : kind === "default"
            ? setDashboardDefaultFor(
                { projectId, expectedRevision: 7, preset: "general" },
                context,
                db,
              )
            : saveDashboardLayoutFor(
                { projectId, expectedRevision: 7, layout: presetDashboardLayout() },
                context,
                db,
              );
      await expect(operation).rejects.toThrow();
      expect(mocks.write).not.toHaveBeenCalled();
    },
  );
  it("does not downgrade an invalid persisted revision to zero", async () => {
    mocks.read.mockResolvedValue({ ...row(), revision: 0 });
    await expect(readDashboardPreferenceFor(context, projectId, db)).rejects.toThrow();
  });
  it("checks fresh authorization before reading preference data", async () => {
    mocks.scope.mockRejectedValue(new AuthorizationError("forbidden"));
    await expect(readDashboardPreferenceFor(context, projectId, db)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
