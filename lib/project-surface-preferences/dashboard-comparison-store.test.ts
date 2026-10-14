import { AuthorizationError } from "@/lib/auth/authorize";
import {
  comparisonContext,
  comparisonProject,
  comparisonSelection,
} from "@/lib/dashboard-competitors/fixture";
import type { ViewDatabase } from "@/lib/saved-views/access";
import { ViewPreferenceConflictError } from "@/lib/saved-views/errors";
import { beforeEach, expect, it, vi } from "vitest";
import { saveDashboardComparisonSelectionFor } from "./dashboard-comparison-store";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), write: vi.fn(), view: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./store", () => ({ preferenceScope: mocks.scope, writePreferenceCas: mocks.write }));
vi.mock("@/lib/dashboard-competitors/view", () => ({ readDashboardComparisonView: mocks.view }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
const preference = () => ({
  revision: 7,
  schemaVersion: 1,
  defaultPresetId: "general",
  defaultSavedViewId: null,
  defaultSavedViewPublicId: null,
  presentation: { schemaVersion: 1, layouts: {} },
});
const tx = {
  userProjectSurfacePreference: { findUnique: vi.fn() },
  projectDefaults: { findUnique: vi.fn() },
  projectMarket: { findFirst: vi.fn() },
};
const db = {
  $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx),
} as unknown as ViewDatabase;
const input = (selection: typeof comparisonSelection | null = comparisonSelection) => ({
  projectId: comparisonProject.publicId,
  expectedRevision: 7,
  selection,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockResolvedValue({
    userId: "viewer",
    actor: { id: "viewer" },
    project: comparisonProject,
  });
  tx.userProjectSurfacePreference.findUnique.mockResolvedValue(preference());
  tx.projectDefaults.findUnique.mockResolvedValue({ enabledExperimentalModules: ["competitors"] });
  tx.projectMarket.findFirst.mockResolvedValue({ id: "market" });
  mocks.view.mockResolvedValue({ config: { scope: { locationId: "loc" } } });
});
it("remembers only the actual revisioned reference under locked view recheck and personal CAS, without changing General", async () => {
  await saveDashboardComparisonSelectionFor(input(), comparisonContext, db);
  expect(mocks.view).toHaveBeenCalledWith(
    tx,
    comparisonContext,
    comparisonProject,
    comparisonSelection,
    true,
  );
  expect(mocks.write.mock.calls[0].slice(2)).toEqual([
    "dashboard",
    7,
    { presentation: { schemaVersion: 1, layouts: {}, competitorSelection: comparisonSelection } },
  ]);
  expect(mocks.write.mock.calls[0][4]).not.toHaveProperty("defaultPresetId");
  expect(mocks.audit.mock.calls[0][0].after).toEqual({
    surface: "dashboard",
    operation: "select_comparison",
    revision: 7,
  });
});
it("clears a remembered reference even when the feature is no longer enabled, without querying another view", async () => {
  await saveDashboardComparisonSelectionFor(input(null), comparisonContext, db);
  expect(mocks.view).not.toHaveBeenCalled();
  expect(tx.projectDefaults.findUnique).not.toHaveBeenCalled();
  expect(mocks.write.mock.calls[0][4].presentation.competitorSelection).toBeNull();
});
it.each(["revoked", "unavailable", "disabled", "unsupported", "removed_market"])(
  "refuses %s before personal write",
  async (kind) => {
    if (kind === "revoked") mocks.scope.mockRejectedValue(new AuthorizationError("forbidden"));
    if (kind === "unavailable") mocks.view.mockResolvedValue(null);
    if (kind === "disabled")
      tx.projectDefaults.findUnique.mockResolvedValue({ enabledExperimentalModules: [] });
    if (kind === "unsupported")
      tx.userProjectSurfacePreference.findUnique.mockResolvedValue({
        ...preference(),
        schemaVersion: 2,
      });
    if (kind === "removed_market") tx.projectMarket.findFirst.mockResolvedValue(null);
    await expect(
      saveDashboardComparisonSelectionFor(input(), comparisonContext, db),
    ).rejects.toThrow();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  },
);
it("retains an actual CAS conflict without an automatic second write or audit", async () => {
  mocks.write.mockRejectedValue(new ViewPreferenceConflictError());
  await expect(
    saveDashboardComparisonSelectionFor(input(), comparisonContext, db),
  ).rejects.toBeInstanceOf(ViewPreferenceConflictError);
  expect(mocks.write).toHaveBeenCalledOnce();
  expect(mocks.audit).not.toHaveBeenCalled();
});
it("rejects forged actor/schedule input at the public action contract", async () => {
  await expect(
    saveDashboardComparisonSelectionFor(
      { ...input(), actorId: "owner", schedule: true },
      comparisonContext,
      db,
    ),
  ).rejects.toThrow();
  expect(mocks.scope).not.toHaveBeenCalled();
});
