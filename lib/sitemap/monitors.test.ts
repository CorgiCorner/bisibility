import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSitemapMonitors, updateSitemapMonitor } from "./monitors";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    project: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    projectSyncPause: { create: vi.fn(), deleteMany: vi.fn() },
    sitemapSnapshot: { findFirst: vi.fn() },
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const actor = { id: "user_1", memberships: [{ projectId: "project_1", role: "admin" as const }] };
const projectPublicId = `prj_a${"0".repeat(23)}`;
const project = {
  domain: "example.com",
  id: "project_1",
  publicId: projectPublicId,
  syncPauses: [],
  writeMode: "active",
};

describe("sitemap monitor core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(project);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue({
      fetchedAt: new Date("2026-07-21T04:45:00.000Z"),
      sitemapUrl: "https://example.com/sitemap.xml",
      urlCount: 25,
    });
  });

  it("lists one monitor derived from the project and latest snapshot", async () => {
    await expect(listSitemapMonitors({ actor, projectId: projectPublicId })).resolves.toEqual([
      expect.objectContaining({
        enabled: true,
        id: projectPublicId,
        latestSnapshot: expect.objectContaining({ urlCount: 25 }),
        status: "active",
      }),
    ]);
  });

  it("writes the pause and legacy flag and audits before and after", async () => {
    const result = await updateSitemapMonitor({
      actor,
      auditActorId: null,
      enabled: false,
      monitorId: projectPublicId,
      projectId: projectPublicId,
    });
    expect(result).toMatchObject({ enabled: false, status: "disabled" });
    expect(mocks.prisma.projectSyncPause.create).toHaveBeenCalledWith({
      data: { actorId: null, kind: "sitemap_fetch", projectId: "project_1" },
    });
    expect(mocks.prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sitemapMonitoringEnabled: false } }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sitemap_monitor.disable",
        actorId: null,
        after: { enabled: false },
        before: { enabled: true },
      }),
      mocks.prisma,
    );
  });

  it("rejects a monitor id that is not the scoped project", async () => {
    await expect(
      updateSitemapMonitor({
        actor,
        enabled: true,
        monitorId: "other",
        projectId: projectPublicId,
      }),
    ).rejects.toThrow("Sitemap monitor not found.");
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  });
});
