import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreferences } from "./notification-prefs";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor(readonly code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.name = "AuthorizationError";
    }
  }
  const roleRank = { admin: 2, auditor: 0.5, member: 1, owner: 3, viewer: 0 };
  const prisma = {
    notificationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
    project: { findFirst: vi.fn() },
    slackConnection: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    webhookEndpoint: { count: vi.fn(), updateMany: vi.fn() },
  };

  return {
    AuthorizationError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) throw new AuthorizationError("unauthenticated");
      const role = actor.memberships?.find(
        (item: { projectId: string }) => item.projectId === resource.projectId,
      )?.role;
      const fallback = action === "manage" ? "admin" : "member";
      const requiredRole = (resource.requiredRole ?? fallback) as keyof typeof roleRank;
      if (!role || roleRank[role as keyof typeof roleRank] < roleRank[requiredRole]) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

function input(overrides: Record<string, unknown> = {}) {
  return {
    alertEmail: true,
    alertInApp: true,
    alertSlack: false,
    alertWebhook: false,
    checkEmail: false,
    checkInApp: true,
    importEmail: true,
    importInApp: true,
    inviteEmail: true,
    inviteInApp: true,
    projectId: "prj_a00000000000000000000000",
    reportEmail: true,
    ...overrides,
  };
}

function mockActor(role: "admin" | "member" | "viewer" = "member") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

describe("notification preference actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_a00000000000000000000000",
    });
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue(null);
    mocks.prisma.notificationPreference.upsert.mockImplementation(({ create }) =>
      Promise.resolve(create),
    );
    mocks.prisma.slackConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(0);
    mocks.writeAudit.mockResolvedValue({});
  });

  it("rejects invalid input before resolving the actor", async () => {
    await expect(updateNotificationPreferences(input({ projectId: "" }))).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it("upserts the current user's preference row and audits the change", async () => {
    const result = await updateNotificationPreferences(
      input({ alertEmail: false, reportEmail: false }),
    );

    expect(result).toMatchObject({
      alertEmail: false,
      projectId: "prj_a00000000000000000000000",
      reportEmail: false,
    });
    expect(mocks.prisma.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          alertEmail: false,
          projectId: "project_1",
          reportEmail: false,
          userId: "user_1",
        }),
        update: expect.objectContaining({ alertEmail: false, reportEmail: false }),
        where: { userId_projectId: { projectId: "project_1", userId: "user_1" } },
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notification_preferences.update" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "settings"), "page");
  });

  it("denies preference updates to viewers", async () => {
    mockActor("viewer");

    await expect(updateNotificationPreferences(input())).rejects.toThrow("not authorized");

    expect(mocks.prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it("requires channel management rights before toggling Slack and webhook delivery", async () => {
    mocks.prisma.slackConnection.findUnique.mockResolvedValue({ enabled: false, id: "slack_1" });
    mocks.prisma.webhookEndpoint.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    await expect(
      updateNotificationPreferences(input({ alertSlack: true, alertWebhook: true })),
    ).rejects.toThrow("not authorized");

    expect(mocks.prisma.slackConnection.update).not.toHaveBeenCalled();
    expect(mocks.prisma.webhookEndpoint.updateMany).not.toHaveBeenCalled();
  });

  it("updates project alert delivery channels for admins", async () => {
    mockActor("admin");
    mocks.prisma.slackConnection.findUnique.mockResolvedValue({ enabled: false, id: "slack_1" });
    mocks.prisma.webhookEndpoint.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    await updateNotificationPreferences(input({ alertSlack: true, alertWebhook: true }));

    expect(mocks.prisma.slackConnection.update).toHaveBeenCalledWith({
      data: { enabled: true },
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.webhookEndpoint.updateMany).toHaveBeenCalledWith({
      data: { enabled: true },
      where: { projectId: "project_1" },
    });
  });
});
