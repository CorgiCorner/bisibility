import { AuthorizationError } from "@/lib/auth/authorize";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeMemberRole, removeMember } from "./team";

const projectPublicId = "prj_a00000000000000000000000";
const memberPublicId = "mbr_a00000000000000000000000";
const adminPublicId = "mbr_b00000000000000000000000";
const viewerPublicId = "mbr_c00000000000000000000000";

const mocks = vi.hoisted(() => ({
  prisma: {
    membership: {
      count: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    project: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(() => Promise.resolve({ id: "audit_failed_1" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

function mockActor(role: "admin" | "member" | "owner" | "viewer") {
  mocks.requireSession.mockResolvedValue({ user: { id: "actor_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "actor_1",
    memberships: [{ projectId: "project_1", role }],
    role: "member",
  });
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "actor_1",
    publicId: projectPublicId,
  });
}

describe("team admin-tier RBAC guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.membership.count.mockResolvedValue(2);
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
    mockActor("admin");
  });

  it("prevents admins from promoting members into the admin tier", async () => {
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "member_2",
      publicId: memberPublicId,
      role: "member",
      userId: "user_2",
    });

    await expect(
      changeMemberRole({ memberId: memberPublicId, projectId: projectPublicId, role: "admin" }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mocks.prisma.membership.update).not.toHaveBeenCalled();
  });

  it("prevents admins from demoting or removing another admin", async () => {
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "member_admin",
      publicId: adminPublicId,
      role: "admin",
      userId: "admin_2",
    });

    await expect(
      changeMemberRole({ memberId: adminPublicId, projectId: projectPublicId, role: "member" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      removeMember({ memberId: adminPublicId, projectId: projectPublicId }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mocks.prisma.membership.update).not.toHaveBeenCalled();
    expect(mocks.prisma.membership.delete).not.toHaveBeenCalled();
  });

  it("lets owners manage admin-tier memberships", async () => {
    mockActor("owner");
    mocks.prisma.membership.findFirst
      .mockResolvedValueOnce({
        id: "member_2",
        publicId: memberPublicId,
        role: "member",
        userId: "user_2",
      })
      .mockResolvedValueOnce({
        id: "member_admin",
        publicId: adminPublicId,
        role: "admin",
        userId: "admin_2",
      })
      .mockResolvedValueOnce({
        id: "member_admin",
        publicId: adminPublicId,
        role: "admin",
        userId: "admin_2",
      });
    mocks.prisma.membership.update
      .mockResolvedValueOnce({
        id: "member_2",
        publicId: memberPublicId,
        role: "admin",
        userId: "user_2",
      })
      .mockResolvedValueOnce({
        id: "member_admin",
        publicId: adminPublicId,
        role: "member",
        userId: "admin_2",
      });
    mocks.prisma.membership.delete.mockResolvedValue({});

    await changeMemberRole({ memberId: memberPublicId, projectId: projectPublicId, role: "admin" });
    await changeMemberRole({ memberId: adminPublicId, projectId: projectPublicId, role: "member" });
    await removeMember({ memberId: adminPublicId, projectId: projectPublicId });

    expect(mocks.prisma.membership.update).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.membership.delete).toHaveBeenCalledWith({ where: { id: "member_admin" } });
  });

  it("lets admins manage member and viewer memberships", async () => {
    mocks.prisma.membership.findFirst
      .mockResolvedValueOnce({
        id: "member_2",
        publicId: memberPublicId,
        role: "member",
        userId: "user_2",
      })
      .mockResolvedValueOnce({
        id: "viewer_2",
        publicId: viewerPublicId,
        role: "viewer",
        userId: "user_3",
      });
    mocks.prisma.membership.update.mockResolvedValue({
      id: "member_2",
      publicId: memberPublicId,
      role: "viewer",
      userId: "user_2",
    });
    mocks.prisma.membership.delete.mockResolvedValue({});

    await changeMemberRole({
      memberId: memberPublicId,
      projectId: projectPublicId,
      role: "viewer",
    });
    await removeMember({ memberId: viewerPublicId, projectId: projectPublicId });

    expect(mocks.prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "viewer" } }),
    );
    expect(mocks.prisma.membership.delete).toHaveBeenCalledWith({ where: { id: "viewer_2" } });
  });

  it("keeps at least one admin or owner on the project", async () => {
    mockActor("owner");
    mocks.prisma.membership.count.mockResolvedValue(1);
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "member_admin",
      publicId: adminPublicId,
      role: "admin",
      userId: "admin_2",
    });

    await expect(
      changeMemberRole({ memberId: adminPublicId, projectId: projectPublicId, role: "member" }),
    ).rejects.toThrow("At least one admin or owner must remain");

    expect(mocks.prisma.membership.update).not.toHaveBeenCalled();
  });
});
