import { getTeamAccess } from "@/lib/queries/team";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invitePublicId = "inv_aaaaaaaaaaaaaaaaaaaaaaaa";
const memberPublicId = "mbr_aaaaaaaaaaaaaaaaaaaaaaaa";

const mocks = vi.hoisted(() => ({
  getProjectRole: vi.fn(),
  prisma: {
    invite: { findMany: vi.fn() },
    membership: { findMany: vi.fn() },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("team access query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "owner_1", memberships: [{ projectId: "project_1", role: "owner" }] },
      project: { id: "project_1" },
    });
    mocks.getProjectRole.mockReturnValue("owner");
    mocks.prisma.membership.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-01-15T12:00:00.000Z"),
        id: "membership_db_1",
        publicId: memberPublicId,
        role: "member",
        userId: "member_1",
        user: { email: "member@example.com", name: "Member Example" },
      },
    ]);
    mocks.prisma.invite.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-07-24T12:00:00.000Z"),
        email: "invite@example.com",
        expiresAt: new Date("2026-07-25T10:00:00.000Z"),
        id: "invite_db_1",
        invitedBy: { email: "owner@example.com", name: "Owner Example" },
        publicId: invitePublicId,
        role: "viewer",
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps inviter identity and expired state into pending invite rows", async () => {
    const result = await getTeamAccess("project_1");

    expect(mocks.prisma.invite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          invitedBy: { select: { email: true, name: true } },
          publicId: true,
        }),
      }),
    );
    expect(result.pendingInvites).toEqual([
      expect.objectContaining({
        email: "invite@example.com",
        expired: true,
        id: invitePublicId,
        invitedByLabel: "Owner Example (owner@example.com)",
      }),
    ]);
    expect(result.members).toEqual([
      expect.objectContaining({ email: "member@example.com", id: memberPublicId }),
    ]);
    expect(JSON.stringify(result)).not.toContain("membership_db_1");
    expect(JSON.stringify(result)).not.toContain("invite_db_1");
  });

  it("surfaces auditor access without exposing auditor as a picker role", async () => {
    mocks.prisma.membership.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-01-15T12:00:00.000Z"),
        id: "membership_db_1",
        publicId: memberPublicId,
        role: "auditor",
        userId: "auditor_1",
        user: { email: "auditor@example.com", name: "Audit Example" },
      },
    ]);

    const result = await getTeamAccess("project_1");

    expect(result.members).toEqual([
      expect.objectContaining({
        canChangeRole: true,
        hasAuditAccess: true,
        role: "Viewer",
        roleValue: "viewer",
      }),
    ]);
  });

  it("does not offer admin controls for another admin", async () => {
    mocks.getProjectRole.mockReturnValue("admin");
    mocks.prisma.membership.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-01-15T12:00:00.000Z"),
        id: "membership_db_1",
        publicId: memberPublicId,
        role: "admin",
        userId: "admin_2",
        user: { email: "admin@example.com", name: "Admin Example" },
      },
    ]);

    const result = await getTeamAccess("project_1");

    expect(result.canAssignAdmin).toBe(false);
    expect(result.members[0]).toEqual(
      expect.objectContaining({ canChangeRole: false, canRemove: false }),
    );
  });
});
