import { deleteProjectById } from "@/lib/projects/settings-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    project: { delete: vi.fn() },
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
    expect(mocks.writeAudit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.project.delete.mock.invocationCallOrder[0],
    );
  });
});
