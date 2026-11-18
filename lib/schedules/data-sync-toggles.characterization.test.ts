import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  audit: vi.fn(),
  read: vi.fn(),
  scope: vi.fn(),
  snapshot: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.audit,
  writeAuditFailure: async () => undefined,
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.actor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.scope,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    project: { findFirst: mocks.read, update: mocks.update },
    sitemapSnapshot: { findFirst: mocks.snapshot },
  },
}));

import { setDomainRatingTracking } from "@/lib/actions/domain-rating";
import { updateSitemapMonitor } from "@/lib/sitemap/monitors";

const projectPublicId = "prj_a00000000000000000000000";
const admin = { id: "actor", memberships: [{ projectId: "p1", role: "admin" as const }] };
const project = {
  domain: "example.com",
  id: "p1",
  publicId: projectPublicId,
  syncPauses: [],
  writeMode: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(admin);
  mocks.scope.mockResolvedValue({ id: "p1", publicId: projectPublicId });
  mocks.read.mockResolvedValue({ ...project, syncPauses: [] });
  mocks.update.mockImplementation(
    async ({ data }: { data: { sitemapMonitoringEnabled: boolean } }) => ({
      ...project,
      sitemapMonitoringEnabled: data.sitemapMonitoringEnabled,
    }),
  );
  mocks.snapshot.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      $queryRaw: vi.fn(),
      sitemapSnapshot: { findFirst: mocks.snapshot },
      projectSyncPause: { create: vi.fn(), deleteMany: vi.fn() },
      project: {
        findUniqueOrThrow: async () => ({ syncPauses: [] }),
        update: mocks.update,
      },
    }),
  );
});

describe("data sync toggles", () => {
  it("saves domain rating and audits project.domain_rating.update", async () => {
    await expect(
      setDomainRatingTracking({ enabled: false, projectId: projectPublicId }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.scope).toHaveBeenCalledWith(admin, "manage", projectPublicId, {
      type: "provider_connection",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project.domain_rating.update",
        after: { enabled: false },
        before: { enabled: true },
      }),
      expect.anything(),
    );
  });

  it("denies domain rating before writing", async () => {
    mocks.scope.mockRejectedValue(new Error("Forbidden"));
    await expect(
      setDomainRatingTracking({ enabled: false, projectId: projectPublicId }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("disables sitemap monitoring and audits sitemap_monitor.disable", async () => {
    const result = await updateSitemapMonitor({
      actor: admin,
      enabled: false,
      monitorId: projectPublicId,
      projectId: projectPublicId,
    });
    expect(result).toMatchObject({ enabled: false, status: "disabled" });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sitemap_monitor.disable",
        after: { enabled: false },
        before: { enabled: true },
      }),
      expect.anything(),
    );
  });

  it("denies a sitemap viewer before writing", async () => {
    await expect(
      updateSitemapMonitor({
        actor: { id: "viewer", memberships: [{ projectId: "p1", role: "viewer" }] },
        enabled: false,
        monitorId: projectPublicId,
        projectId: projectPublicId,
      }),
    ).rejects.toThrow("not authorized");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
