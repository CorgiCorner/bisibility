import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { deleteTeamMember, resendTeamInvite, updateTeamMemberRole } from "./team";

const mocks = vi.hoisted(() => ({
  changeRole: vi.fn(),
  remove: vi.fn(),
  resend: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/team/service", () => ({
  changeTeamMemberRole: mocks.changeRole,
  inviteTeamMember: vi.fn(),
  removeTeamMember: mocks.remove,
  resendTeamInvite: mocks.resend,
  revokeTeamInvite: vi.fn(),
}));

function context(method: string, body?: unknown) {
  const url = new URL("https://example.test/api/v1/projects/prj_1/team/members/member_1");
  return {
    actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "owner" }] },
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    path: [],
    req: new Request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      method,
    }),
    url,
  } as unknown as ApiContext;
}

describe("team mutation REST endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.changeRole.mockResolvedValue({ id: "member_1", role: "viewer" });
    mocks.remove.mockResolvedValue({ id: "member_1" });
    mocks.resend.mockResolvedValue({
      expiresAt: "2026-07-29T10:00:00.000Z",
      id: "invite_1",
      inviteLink: "https://example.test/invite/token",
    });
  });

  it("updates a member role through the action authorization layer", async () => {
    const response = await updateTeamMemberRole(
      context("PATCH", { role: "viewer" }),
      "member_1",
      "prj_1",
    );
    await expect(response.json()).resolves.toEqual({ id: "member_1", role: "viewer" });
    expect(mocks.changeRole).toHaveBeenCalledWith(
      { memberId: "member_1", projectId: "project_1", role: "viewer" },
      {
        actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "owner" }] },
        auditActorId: "user_1",
      },
    );
  });

  it("removes a member through the action authorization layer", async () => {
    const response = await deleteTeamMember(context("DELETE"), "member_1", "prj_1");
    await expect(response.json()).resolves.toEqual({ id: "member_1" });
    expect(mocks.remove).toHaveBeenCalledWith(
      { memberId: "member_1", projectId: "project_1" },
      expect.objectContaining({ auditActorId: "user_1" }),
    );
  });

  it("resends an invite through the action authorization layer", async () => {
    const response = await resendTeamInvite(context("POST"), "invite_1", "prj_1");
    await expect(response.json()).resolves.toMatchObject({
      expires_at: "2026-07-29T10:00:00.000Z",
      id: "invite_1",
    });
    expect(mocks.resend).toHaveBeenCalledWith(
      { inviteId: "invite_1", projectId: "project_1" },
      expect.objectContaining({ auditActorId: "user_1" }),
    );
  });

  it("rejects owner as a direct role mutation", async () => {
    await expect(
      updateTeamMemberRole(context("PATCH", { role: "owner" }), "member_1", "prj_1"),
    ).rejects.toThrow();
    expect(mocks.changeRole).not.toHaveBeenCalled();
  });
});
