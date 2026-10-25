import { deleteProjectById } from "@/lib/projects/settings-store";
import { dateFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const retirementAt = dateFromFrozenNow({ seconds: 1 });

const mocks = vi.hoisted(() => {
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    providerIncident: { updateMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    project: { delete: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };

  return { prisma, writeAudit: vi.fn() };
});

vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("deleteProjectById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockImplementation(async (query: TemplateStringsArray) =>
      Array.isArray(query) && query.join("").includes("clock_timestamp()")
        ? [{ now: retirementAt }]
        : [],
    );
    mocks.prisma.project.findUnique.mockResolvedValue({ providerIncidentsRetiredThrough: null });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma),
    );
    mocks.prisma.project.delete.mockResolvedValue({ id: "project_internal_1" });
    mocks.writeAudit.mockResolvedValue({});
  });

  it("writes the deletion audit before deleting within one transaction", async () => {
    const before = {
      _count: { apiKeys: 1, keywords: 2, members: 3, providerConnections: 4 },
      domain: "example.com",
      name: "Example",
      publicId: "prj_a00000000000000000000000",
    };

    await expect(
      deleteProjectById("project_internal_1", {
        actorId: "user_1",
        before,
        targetId: "prj_a00000000000000000000000",
      }),
    ).resolves.toEqual({ id: "project_internal_1" });

    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      {
        action: "project.delete",
        actorId: "user_1",
        before,
        projectId: "project_internal_1",
        targetId: "prj_a00000000000000000000000",
        targetType: "project",
      },
      mocks.prisma,
    );
    expect(mocks.prisma.project.update).toHaveBeenCalledWith({
      where: { id: "project_internal_1" },
      data: { providerIncidentsRetiredThrough: retirementAt },
    });
    expect(mocks.prisma.providerIncident.updateMany).toHaveBeenCalledWith({
      where: { projectId: "project_internal_1", state: "open" },
      data: { state: "resolved", resolvedAt: expect.any(Date), openSlot: null },
    });
    expect(mocks.prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "project_internal_1", type: "provider_incident" },
    });
    expect(mocks.prisma.notification.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.project.delete.mock.invocationCallOrder[0],
    );
    expect(mocks.writeAudit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.project.delete.mock.invocationCallOrder[0],
    );
  });
});
