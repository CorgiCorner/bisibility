import type { Actor } from "@/lib/auth/authorize";
import { beforeEach, expect, it, vi } from "vitest";
import { inviteTeamMember, resendTeamInvite, revokeTeamInvite } from "./service";

const mocks = vi.hoisted(() => ({
  prisma: {
    project: { findFirst: vi.fn() },
    membership: { findFirst: vi.fn() },
    invite: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  mail: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(async () => {}),
}));
vi.mock("@/lib/actions/team-invite-delivery", () => ({
  assertInviteMailerReady: vi.fn(),
  deliverInvite: mocks.mail,
}));
vi.mock("./invite-rate-limit", () => ({
  assertInviteCreateAllowed: vi.fn(),
  assertInviteResendAllowed: vi.fn(),
}));
const projectId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const inviteId = "inv_aaaaaaaaaaaaaaaaaaaaaaaa";
const invite = { id: "invite", publicId: inviteId, email: "fixture@example.test", role: "admin" };
function context(role: "admin" | "owner" | "viewer") {
  const actor: Actor = { id: "user", memberships: [{ projectId: "project", role }] };
  return { actor, auditActorId: actor.id };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project",
    publicId: projectId,
    writeMode: "active",
  });
  mocks.prisma.membership.findFirst.mockResolvedValue(null);
  mocks.prisma.invite.findUnique.mockResolvedValue(null);
  mocks.prisma.invite.findFirst.mockResolvedValue(invite);
  mocks.prisma.invite.upsert.mockResolvedValue(invite);
  mocks.prisma.invite.update.mockResolvedValue(invite);
  mocks.mail.mockResolvedValue({ status: "success" });
});
it("denies admin invitations by an admin", async () => {
  await expect(
    inviteTeamMember({ projectId, email: invite.email, role: "admin" }, context("admin")),
  ).rejects.toMatchObject({ code: "forbidden" });
  expect(mocks.prisma.invite.upsert).not.toHaveBeenCalled();
  expect(mocks.mail).not.toHaveBeenCalled();
});
it("denies replacing an existing admin invitation with a lower role", async () => {
  mocks.prisma.invite.findUnique.mockResolvedValue(invite);
  await expect(
    inviteTeamMember({ projectId, email: invite.email, role: "viewer" }, context("admin")),
  ).rejects.toMatchObject({ code: "forbidden" });
  expect(mocks.prisma.invite.upsert).not.toHaveBeenCalled();
});
it.each([resendTeamInvite, revokeTeamInvite])(
  "denies managing an admin invitation by an admin",
  async (operation) => {
    await expect(operation({ projectId, inviteId }, context("admin"))).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(mocks.prisma.invite.update).not.toHaveBeenCalled();
    expect(mocks.prisma.invite.delete).not.toHaveBeenCalled();
    expect(mocks.mail).not.toHaveBeenCalled();
  },
);
it("allows an owner to invite an admin", async () => {
  await inviteTeamMember({ projectId, email: invite.email, role: "admin" }, context("owner"));
  expect(mocks.prisma.invite.upsert).toHaveBeenCalledOnce();
});
it("allows an admin to invite a member", async () => {
  await inviteTeamMember({ projectId, email: invite.email, role: "member" }, context("admin"));
  expect(mocks.prisma.invite.upsert).toHaveBeenCalledOnce();
});
