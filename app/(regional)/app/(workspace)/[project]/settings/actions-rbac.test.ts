import { beforeEach, expect, it, vi } from "vitest";
import { deleteWorkspace, updateProject } from "./actions";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  audit: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    project: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.audit,
  writeAuditFailure: vi.fn(async () => {}),
  requiredPublicAuditId: (value: string) => value,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const projectId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const project = {
  id: "project-db",
  publicId: projectId,
  domain: "example.test",
  name: "Example",
  writeMode: "active",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "caller" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: project.id, role: "owner" }],
  });
  mocks.prisma.project.findFirst.mockResolvedValue(project);
  mocks.prisma.project.findUnique.mockResolvedValue(project);
  mocks.prisma.project.findMany.mockResolvedValue([]);
  mocks.prisma.$transaction.mockImplementation((run) => run(mocks.prisma));
});
const operations = [
  { operation: deleteWorkspace, input: { projectId, confirmText: project.domain } },
  { operation: updateProject, input: { projectId, name: "Renamed", domain: project.domain } },
];
it.each(operations)(
  "requires a session before project reads or writes",
  async ({ operation, input }) => {
    mocks.session.mockRejectedValue(new Error("Authentication is required"));
    await expect(operation(input)).rejects.toThrow("Authentication is required");
    expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.project.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  },
);
it.each(operations)(
  "denies a viewer or a foreign owner before reading the snapshot",
  async ({ operation, input }) => {
    for (const membership of [
      { projectId: project.id, role: "viewer" },
      { projectId: "another", role: "owner" },
    ]) {
      mocks.prisma.user.findUnique.mockResolvedValue({ memberships: [membership] });
      await expect(operation(input)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.project.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  },
);
it("deletes only as the current owner and ignores forged audit identity", async () => {
  await deleteWorkspace({ projectId, confirmText: project.domain, actorId: "forged" });
  expect(mocks.prisma.project.delete).toHaveBeenCalledWith({ where: { id: project.id } });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: "caller", targetId: projectId }),
    mocks.prisma,
  );
});
it("denies deleting a project by its admin", async () => {
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: project.id, role: "admin" }],
  });
  await expect(deleteWorkspace({ projectId, confirmText: project.domain })).rejects.toMatchObject({
    code: "forbidden",
  });
  expect(mocks.prisma.project.delete).not.toHaveBeenCalled();
});
