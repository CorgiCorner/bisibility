import { AuthorizationError } from "@/lib/auth/authorize";
import { resetInviteRateLimitStateForTests } from "@/lib/team/invite-rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptInvite,
  changeMemberRole,
  inviteMember,
  removeMember,
  resendInvite,
  revokeInvite,
  transferOwnership,
} from "./team";

const INVITE_PUBLIC_ID = "inv_abcdefghijklmnopqrstuvwx";
const MEMBER_PUBLIC_ID = "mbr_abcdefghijklmnopqrstuvwx";
const USER_PUBLIC_ID = "usr_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    dailySendCounter: { upsert: vi.fn() },
    invite: {
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    membership: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    project: { findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  reserveEmailDailyBudget: vi.fn(),
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
vi.mock("@/lib/email/budget", () => ({
  reserveEmailDailyBudget: mocks.reserveEmailDailyBudget,
}));

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
    publicId: "prj_abcdefghijklmnopqrstuvwx",
  });
}

describe("team actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInviteRateLimitStateForTests();
    process.env.SITE_URL = "https://app.example.com";
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "resend_test";
    process.env.EMAIL_FROM = "Bisibility <notifications@example.com>";
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    mocks.reserveEmailDailyBudget.mockResolvedValue({
      day: new Date("2026-07-23T00:00:00.000Z"),
      granted: true,
      limit: 1_000,
      notificationDue: false,
    });
    mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.prisma));
    mocks.prisma.invite.updateMany.mockResolvedValue({ count: 1 });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
    mockActor("admin");
  });

  it("creates invites with a hashed token, emails the raw link and audits", async () => {
    let storedToken = "";
    mocks.prisma.membership.findFirst.mockResolvedValue(null);
    mocks.prisma.invite.upsert.mockImplementation(({ create }) => {
      storedToken = create.token;
      return Promise.resolve({
        email: create.email,
        expiresAt: create.expiresAt,
        id: "invite_1",
        invitedBy: { email: "owner@example.com", name: "Owner" },
        project: { name: "Acme" },
        publicId: INVITE_PUBLIC_ID,
        role: create.role,
      });
    });

    const result = await inviteMember({
      email: "Teammate@Example.com",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      role: "member",
    });
    const rawToken = result.inviteLink.split("/").at(-1) ?? "";

    expect(storedToken).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(storedToken).not.toContain(rawToken);
    expect(mocks.prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project_1",
          user: { email: { equals: "teammate@example.com", mode: "insensitive" } },
        },
      }),
    );
    expect(mocks.prisma.invite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ email: "teammate@example.com" }),
        where: {
          projectId_email: { email: "teammate@example.com", projectId: "project_1" },
        },
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team.invite.create", targetId: INVITE_PUBLIC_ID }),
    );
  });

  it("denies invite management to viewers before writing", async () => {
    mockActor("viewer");

    await expect(
      inviteMember({
        email: "teammate@example.com",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mocks.prisma.invite.upsert).not.toHaveBeenCalled();
  });

  it("rejects a case-variant address for an existing member", async () => {
    mocks.prisma.membership.findFirst.mockResolvedValue({ id: "member_1" });

    await expect(
      inviteMember({
        email: "TEAMMATE@Example.com",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        role: "member",
      }),
    ).rejects.toThrow("already a member");

    expect(mocks.prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project_1",
          user: { email: { equals: "teammate@example.com", mode: "insensitive" } },
        },
      }),
    );
    expect(mocks.prisma.invite.upsert).not.toHaveBeenCalled();
  });

  it("uses one stored identity for repeated mixed-case invites", async () => {
    mocks.prisma.membership.findFirst.mockResolvedValue(null);
    mocks.prisma.invite.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        email: create.email,
        expiresAt: create.expiresAt,
        id: "invite_1",
        invitedBy: { email: "owner@example.com", name: "Owner" },
        project: { name: "Acme" },
        publicId: INVITE_PUBLIC_ID,
        role: create.role,
      }),
    );

    await inviteMember({
      email: "Repeat@Example.com",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      role: "viewer",
    });
    await inviteMember({
      email: "REPEAT@example.COM",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      role: "viewer",
    });

    expect(mocks.prisma.invite.upsert).toHaveBeenCalledTimes(2);
    for (const call of mocks.prisma.invite.upsert.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          create: expect.objectContaining({ email: "repeat@example.com" }),
          where: {
            projectId_email: { email: "repeat@example.com", projectId: "project_1" },
          },
        }),
      );
    }
  });

  it("accepts a valid token only for the invited email", async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: "invitee_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      email: "teammate@example.com",
      id: "invitee_1",
    });
    mocks.prisma.invite.findUnique.mockResolvedValue({
      acceptedAt: null,
      email: "teammate@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      id: "invite_1",
      project: { publicId: "prj_abcdefghijklmnopqrstuvwx" },
      projectId: "project_1",
      publicId: INVITE_PUBLIC_ID,
      role: "member",
    });
    mocks.prisma.membership.findFirst.mockResolvedValue(null);
    mocks.prisma.membership.create.mockResolvedValue({
      id: "member_1",
      publicId: MEMBER_PUBLIC_ID,
      role: "member",
    });
    mocks.prisma.invite.update.mockResolvedValue({});

    const result = await acceptInvite({ token: "raw_invite_token_1234567890" });

    expect(result).toEqual({
      id: MEMBER_PUBLIC_ID,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      role: "member",
    });
    expect(mocks.prisma.invite.findUnique.mock.calls[0][0].where.token).toMatch(/^sha256:/);
    expect(mocks.prisma.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "project_1",
          role: "member",
          userId: "invitee_1",
        }),
      }),
    );
    expect(mocks.prisma.invite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ acceptedAt: null, id: "invite_1" }),
      }),
    );
  });

  it("rejects invite acceptance when the signed-in email differs", async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: "invitee_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({ email: "other@example.com", id: "invitee_1" });
    mocks.prisma.invite.findUnique.mockResolvedValue({
      acceptedAt: null,
      email: "teammate@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      id: "invite_1",
      projectId: "project_1",
      publicId: INVITE_PUBLIC_ID,
      role: "member",
    });

    await expect(acceptInvite({ token: "raw_invite_token_1234567890" })).rejects.toThrow(
      "Use the invited email",
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not let an invite change an existing member role", async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: "invitee_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      email: "Teammate@Example.com",
      id: "invitee_1",
    });
    mocks.prisma.invite.findUnique.mockResolvedValue({
      acceptedAt: null,
      email: "teammate@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      id: "invite_1",
      projectId: "project_1",
      publicId: INVITE_PUBLIC_ID,
      role: "admin",
    });
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "member_1",
      publicId: MEMBER_PUBLIC_ID,
      role: "viewer",
      userId: "invitee_1",
    });

    await expect(acceptInvite({ token: "raw_invite_token_1234567890" })).rejects.toThrow(
      "already a member",
    );
    expect(mocks.prisma.membership.update).not.toHaveBeenCalled();
    expect(mocks.prisma.invite.updateMany).not.toHaveBeenCalled();
  });

  it("rejects used invite tokens before creating membership", async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: "invitee_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      email: "teammate@example.com",
      id: "invitee_1",
    });
    mocks.prisma.invite.findUnique.mockResolvedValue({
      acceptedAt: new Date(),
      email: "teammate@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      id: "invite_1",
      projectId: "project_1",
      publicId: INVITE_PUBLIC_ID,
      role: "member",
    });

    await expect(acceptInvite({ token: "raw_invite_token_1234567890" })).rejects.toThrow(
      "Invite is invalid or expired.",
    );
    expect(mocks.prisma.membership.create).not.toHaveBeenCalled();
  });

  it("revokes and resends pending invites with audit records", async () => {
    const invite = {
      email: "teammate@example.com",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      id: "invite_1",
      publicId: INVITE_PUBLIC_ID,
      invitedBy: { email: "owner@example.com", name: "Owner" },
      project: { name: "Acme" },
      role: "admin",
    };
    mocks.prisma.invite.findFirst.mockResolvedValue(invite);
    mocks.prisma.invite.delete.mockResolvedValue(invite);
    mocks.prisma.invite.update.mockResolvedValue({ ...invite, expiresAt: new Date() });

    await revokeInvite({
      inviteId: INVITE_PUBLIC_ID,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });
    const result = await resendInvite({
      inviteId: INVITE_PUBLIC_ID,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(result.inviteLink).toContain("https://app.example.com/invite/");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team.invite.revoke" }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team.invite.resend" }),
    );
  });

  it("stops repeated resends before rotating or delivering again", async () => {
    const inviteId = "inv_bbcdefghijklmnopqrstuvwx";
    const invite = {
      email: "teammate@example.com",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      id: inviteId,
      invitedBy: { email: "owner@example.com", name: "Owner" },
      project: { name: "Acme" },
      publicId: inviteId,
      role: "viewer",
    };
    mocks.prisma.invite.findFirst.mockResolvedValue(invite);
    mocks.prisma.invite.update.mockResolvedValue(invite);

    await resendInvite({ inviteId, projectId: "prj_abcdefghijklmnopqrstuvwx" });
    await expect(
      resendInvite({ inviteId, projectId: "prj_abcdefghijklmnopqrstuvwx" }),
    ).rejects.toThrow("Try again in 60 seconds");

    expect(mocks.prisma.invite.update).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("changes and removes non-owner members only", async () => {
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "member_2",
      publicId: MEMBER_PUBLIC_ID,
      role: "member",
      userId: "user_2",
    });
    mocks.prisma.membership.update.mockResolvedValue({
      id: "member_2",
      publicId: MEMBER_PUBLIC_ID,
      role: "viewer",
      userId: "user_2",
    });
    mocks.prisma.membership.delete.mockResolvedValue({});

    await changeMemberRole({
      memberId: MEMBER_PUBLIC_ID,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      role: "viewer",
    });
    await removeMember({
      memberId: MEMBER_PUBLIC_ID,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(mocks.prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "viewer" } }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team.member.remove" }),
    );
  });

  it("blocks direct owner role edits", async () => {
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "member_owner",
      publicId: "mbr_bbcdefghijklmnopqrstuvwx",
      role: "owner",
      userId: "owner_1",
    });

    await expect(
      changeMemberRole({
        memberId: "mbr_bbcdefghijklmnopqrstuvwx",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        role: "viewer",
      }),
    ).rejects.toThrow("Member is not editable.");
    expect(mocks.prisma.membership.update).not.toHaveBeenCalled();
  });

  it("transfers ownership only from an owner", async () => {
    mockActor("owner");
    mocks.prisma.membership.findFirst.mockResolvedValue({
      id: "member_2",
      publicId: MEMBER_PUBLIC_ID,
      role: "admin",
      userId: "user_2",
    });
    mocks.prisma.membership.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.membership.update.mockResolvedValue({
      id: "member_2",
      publicId: MEMBER_PUBLIC_ID,
      role: "owner",
      user: { publicId: USER_PUBLIC_ID },
      userId: "user_2",
    });
    mocks.prisma.project.update.mockResolvedValue({ id: "project_1" });

    await transferOwnership({
      memberId: MEMBER_PUBLIC_ID,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(mocks.prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "admin" } }),
    );
    expect(mocks.prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ownerId: "user_2" } }),
    );
  });

  it("denies ownership transfer for admins", async () => {
    mockActor("admin");

    await expect(
      transferOwnership({
        memberId: MEMBER_PUBLIC_ID,
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.prisma.membership.updateMany).not.toHaveBeenCalled();
  });
});
