import type { ApiContext } from "@/lib/api/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => {
  const row = {
    id: "defaults",
    projectId: "project",
    country: "United States",
    city: null,
    device: "desktop",
    locationKey: "US",
    frequency: "daily",
    cronExpression: null,
    timezone: "UTC",
    jitterMinutes: 0,
    serpDepth: 50,
    serpStopOnMatch: false,
    inspectionDailyLimit: 50,
    searchSyncImportMonths: null,
    searchSyncPace: null,
    nextCheckAt: null,
    lastCheckedAt: null,
    updatedAt: new Date("2026-10-13T00:00:00Z"),
  };
  const upsert = vi.fn(async () => row),
    writer = vi.fn(async () => row);
  return {
    row,
    upsert,
    writer,
    actor: { id: "actor" },
    project: { id: "project", publicId: `prj_${"a".repeat(24)}` },
    resolve: vi.fn(async () => ({
      location: {
        id: "location",
        canonicalKey: "US",
        kind: "country",
        displayName: "United States",
        countryCode: "US",
        languageCode: "en",
      },
    })),
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({ projectDefaults: { upsert } }),
    ),
    audit: vi.fn(),
    refresh: vi.fn(),
  };
});
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: f.transaction,
    projectDefaults: { findUnique: vi.fn(async () => f.row), upsert: f.upsert },
    keyword: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => f.actor,
  requireProjectScope: async () => f.project,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  revalidateSettingsViews: f.refresh,
  revalidateSettingsPage: f.refresh,
  revalidateRankCheckViews: f.refresh,
}));
vi.mock("@/lib/settings/project-defaults-service", () => ({
  updateProjectDefaultsInTransaction: f.writer,
}));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: f.resolve,
  resolveKeywordLocationUsingStore: f.resolve,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: f.audit }));
vi.mock("@/lib/queries/onboarding", () => ({ getOnboardingNextCheckAt: async () => null }));
vi.mock("@/lib/alerts/depth-conflict.server", () => ({
  getProjectDepthDecreaseWarning: async () => null,
}));
vi.mock("@/lib/rank-check/dispatcher-state", () => ({ refreshKeywordDispatchStates: vi.fn() }));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-settings-test-key-only-000")],
}));

import { updateProjectDefaults as updateProjectApi } from "@/lib/api/project-defaults";
import { updateProjectDefaults as updateProjectAction } from "./project";
import { updateDefaultRankCheckSettings, updateRankCheckFrequency } from "./settings";

const values = {
  projectId: f.project.publicId,
  country: "United States",
  device: "desktop",
  locationKey: "US",
  frequency: "daily",
  timezone: "UTC",
  jitterMinutes: 0,
  serpDepth: 50,
  serpStopOnMatch: false,
};
beforeEach(() => {
  vi.clearAllMocks();
});
describe("reachable defaults writers require a reviewed source", () => {
  it.each([updateDefaultRankCheckSettings, updateRankCheckFrequency, updateProjectAction])(
    "refuses an unreviewed enabled/deeper/full-scan form before mutation, case %#",
    async (action) => {
      await expect(action(values)).resolves.toMatchObject({
        kind: "not_saved",
        code: "preview_required",
      });
      expect(f.transaction).not.toHaveBeenCalled();
      expect(f.writer).not.toHaveBeenCalled();
      expect(f.resolve).not.toHaveBeenCalled();
      expect(f.upsert).not.toHaveBeenCalled();
    },
  );
  it("returns controlled preview_required from the existing API route without changing v1 data", async () => {
    const url = new URL(`https://fixture.invalid/api/v1/projects/${f.project.publicId}/defaults`);
    const ctx: ApiContext = {
      actor: { id: "actor", memberships: [{ projectId: "project", role: "admin" }] },
      actorId: null,
      auth: {
        apiKey: {
          id: "key",
          projectId: "project",
          name: "synthetic",
          prefix: "fixture",
          scopes: ["write"],
        },
        project: {
          id: "project",
          publicId: f.project.publicId,
          ownerId: "actor",
          domain: "fixture.invalid",
          name: "Fixture",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      },
      headers: new Headers(),
      instance: url.href,
      method: "PATCH",
      path: ["projects", f.project.publicId, "defaults"],
      origin: {
        credentialKind: "project_key",
        credentialId: "key",
        source: "api",
        surface: "programmatic",
      },
      url,
      req: new Request(url, { method: "PATCH", body: JSON.stringify(values) }),
    };
    const response = await updateProjectApi(ctx, f.project.publicId);
    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({ details: { reason: "preview_required" } });
    expect(f.upsert).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.resolve).not.toHaveBeenCalled();
  });
});
