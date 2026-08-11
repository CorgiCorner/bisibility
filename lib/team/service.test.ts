import { changeTeamMemberRole, removeTeamMember, revokeTeamInvite } from "@/lib/team/service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invitePublicId = "inv_aaaaaaaaaaaaaaaaaaaaaaaa";

const mocks = vi.hoisted(() => ({
  prisma: {
    invite: { delete: vi.fn(), findFirst: vi.fn() },
    membership: { delete: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
  requireProjectScope: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/actions/team-invite-delivery", () => ({
  assertInviteMailerReady: vi.fn(),
  deliverInvite: vi.fn(),
}));
vi.mock("@/lib/actions/team-rbac", () => ({
  assertAdminOrOwnerRemains: vi.fn(),
  assertOwnerForAdminTier: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/team/invite-rate-limit", () => ({
  assertInviteCreateAllowed: vi.fn(),
  assertInviteResendAllowed: vi.fn(),
}));

const context = {
  actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "owner" }] },
  auditActorId: "user_1",
} as never;

describe("team service public identifiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1" });
    mocks.writeAudit.mockResolvedValue({});
  });

  it("rejects raw invite and membership keys before a lookup", async () => {
    await expect(
      revokeTeamInvite({ inviteId: "invite_db_1", projectId: "prj_1" }, context),
    ).rejects.toThrow("Invite not found.");
    await expect(
      removeTeamMember({ memberId: "membership_db_1", projectId: "prj_1" }, context),
    ).rejects.toThrow("Member is not editable.");

    expect(mocks.prisma.invite.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.membership.findFirst).not.toHaveBeenCalled();
  });

  it("looks up and returns the public invite ID, never its database key", async () => {
    mocks.prisma.invite.findFirst.mockResolvedValue({
      email: "teammate@example.com",
      id: "invite_db_1",
      publicId: invitePublicId,
      role: "viewer",
    });

    await expect(
      revokeTeamInvite({ inviteId: invitePublicId, projectId: "prj_1" }, context),
    ).resolves.toEqual({ id: invitePublicId });

    expect(mocks.prisma.invite.findFirst).toHaveBeenCalledWith({
      where: { acceptedAt: null, projectId: "project_1", publicId: invitePublicId },
    });
    expect(mocks.prisma.invite.delete).toHaveBeenCalledWith({ where: { id: "invite_db_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: invitePublicId }),
    );
  });

  it("replaces an auditor grant with the selected role and audits the loss", async () => {
    const memberPublicId = "mbr_aaaaaaaaaaaaaaaaaaaaaaaa";
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "membership_db_1",
      publicId: memberPublicId,
      role: "auditor",
      userId: "auditor_1",
    });
    mocks.prisma.membership.update.mockResolvedValue({
      id: "membership_db_1",
      publicId: memberPublicId,
      role: "member",
      userId: "auditor_1",
    });

    await expect(
      changeTeamMemberRole(
        { memberId: memberPublicId, projectId: "prj_1", role: "member" },
        context,
      ),
    ).resolves.toEqual({ id: memberPublicId, role: "member" });

    expect(mocks.prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "member" } }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.member.role_change",
        after: { role: "member" },
        before: { role: "auditor" },
      }),
    );
  });
});
