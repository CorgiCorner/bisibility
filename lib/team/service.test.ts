import {
  changeTeamMemberRole,
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvite,
  revokeTeamInvite,
} from "@/lib/team/service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invitePublicId = "inv_aaaaaaaaaaaaaaaaaaaaaaaa";

const mocks = vi.hoisted(() => ({
  prisma: {
    invite: {
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    membership: { delete: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  capacityCheck: vi.fn(),
  prepareCapacity: vi.fn(),
  deliverInvite: vi.fn(),
  removeMembershipSideEffects: vi.fn(),
  requireProjectScope: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/actions/team-invite-delivery", () => ({
  assertInviteMailerReady: vi.fn(),
  deliverInvite: mocks.deliverInvite,
}));
vi.mock("@/lib/actions/team-rbac", () => ({
  assertAdminOrOwnerRemains: vi.fn(),
  assertOwnerForAdminTier: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/capacity/capacity-extension", () => ({
  prepareResourceCapacity: mocks.prepareCapacity,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/team/membership-cleanup", () => ({
  removeMembershipSideEffects: mocks.removeMembershipSideEffects,
}));
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
    mocks.capacityCheck.mockResolvedValue(undefined);
    mocks.prepareCapacity.mockResolvedValue({ enabled: true, check: mocks.capacityCheck });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1" });
    mocks.writeAudit.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation((run: never) =>
      (run as never as (tx: unknown) => unknown)(mocks.prisma),
    );
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
    expect(mocks.prisma.invite.delete).toHaveBeenCalledWith({
      where: { id: "invite_db_1", role: "viewer" },
    });
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
  it("clears alert recipients and notification settings with the membership", async () => {
    const memberPublicId = "mbr_bbbbbbbbbbbbbbbbbbbbbbbb";
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "membership_db_2",
      publicId: memberPublicId,
      role: "member",
      userId: "user_2",
    });

    await expect(
      removeTeamMember({ memberId: memberPublicId, projectId: "prj_1" }, context),
    ).resolves.toEqual({ id: memberPublicId });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.membership.delete).toHaveBeenCalledWith({
      where: { id: "membership_db_2" },
    });
    expect(mocks.removeMembershipSideEffects).toHaveBeenCalledWith(mocks.prisma, {
      projectId: "project_1",
      userId: "user_2",
    });
  });
  it.each(["invite", "resend", "promote"] as const)(
    "checks %s capacity before delivery or committed callbacks",
    async (operation) => {
      const denied = new Error("No team seats left");
      mocks.capacityCheck.mockRejectedValueOnce(denied);
      mocks.prisma.invite.findUnique.mockResolvedValue(null);
      mocks.prisma.invite.findFirst.mockResolvedValue({ id: "invite_db_1", role: "member" });
      mocks.prisma.membership.findFirst.mockResolvedValue(
        operation === "promote"
          ? {
              id: "member_db_1",
              publicId: "mbr_aaaaaaaaaaaaaaaaaaaaaaaa",
              role: "viewer",
              userId: "person",
            }
          : null,
      );
      const committed = vi.fn();
      const attempt =
        operation === "invite"
          ? inviteTeamMember(
              { email: "person@example.com", projectId: "prj_1", role: "member" },
              context,
              committed,
            )
          : operation === "resend"
            ? resendTeamInvite({ inviteId: invitePublicId, projectId: "prj_1" }, context, committed)
            : changeTeamMemberRole(
                { memberId: "mbr_aaaaaaaaaaaaaaaaaaaaaaaa", projectId: "prj_1", role: "member" },
                context,
              );
      await expect(attempt).rejects.toBe(denied);
      expect(mocks.prepareCapacity).toHaveBeenCalledWith(mocks.prisma, {
        projectId: "project_1",
        dimensions: ["teamMembers"],
      });
      expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
      expect(mocks.deliverInvite).not.toHaveBeenCalled();
      expect(committed).not.toHaveBeenCalled();
      expect(mocks.writeAudit).not.toHaveBeenCalled();
    },
  );
});
