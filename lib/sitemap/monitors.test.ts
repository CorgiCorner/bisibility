import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSitemapMonitors, updateSitemapMonitor } from "./monitors";

const mocks = vi.hoisted(() => ({
  prisma: {
    project: { findFirst: vi.fn(), update: vi.fn() },
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
  sitemapMonitoringEnabled: true,
  writeMode: "active",
};

describe("sitemap monitor core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.project.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...project, sitemapMonitoringEnabled: data.sitemapMonitoringEnabled }),
    );
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

  it("updates only the persisted enable flag and audits before and after", async () => {
    const result = await updateSitemapMonitor({
      actor,
      auditActorId: null,
      enabled: false,
      monitorId: projectPublicId,
      projectId: projectPublicId,
    });
    expect(result).toMatchObject({ enabled: false, status: "disabled" });
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
