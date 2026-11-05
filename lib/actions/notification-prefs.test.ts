import {
  applyNotificationPreferences,
  type NotificationPreferencesForm,
} from "@/lib/notifications/preferences-update";
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
    $transaction: vi.fn(),
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
    readPreferences: vi.fn(),
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
vi.mock("@/lib/queries/notification-prefs", () => ({
  readNotificationPreferencesFor: mocks.readPreferences,
}));

function input(overrides: Record<string, unknown> = {}) {
  return {
    alertEmail: true,
    alertInApp: true,
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
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
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

  it("keeps project endpoints unchanged during a personal off then on patch", async () => {
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(2);
    await updateNotificationPreferences({
      projectId: "prj_a00000000000000000000000",
      alertEmail: false,
    });
    await updateNotificationPreferences({
      projectId: "prj_a00000000000000000000000",
      alertEmail: true,
    });
    expect(mocks.prisma.webhookEndpoint.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.slackConnection.update).not.toHaveBeenCalled();
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
      mocks.prisma,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "settings"), "page");
  });

  it("denies preference updates to viewers", async () => {
    mockActor("viewer");

    mocks.readPreferences.mockResolvedValue({ alertEmail: true, projectId: "prj_1" });

    await expect(updateNotificationPreferences(input())).rejects.toThrow("not authorized");

    expect(mocks.prisma.notificationPreference.upsert).not.toHaveBeenCalled();
    expect(mocks.readPreferences).not.toHaveBeenCalled();
  });

  it("answers an unconfirmed write with the persisted preferences", async () => {
    mocks.writeAudit.mockRejectedValueOnce(new Error("audit store unavailable"));
    mocks.readPreferences.mockResolvedValue({ alertEmail: true, projectId: "prj_1" });

    const result = await updateNotificationPreferences({
      alertEmail: false,
      projectId: "prj_a00000000000000000000000",
    });

    expect(result).toEqual({ alertEmail: true, projectId: "prj_1", saveFailed: true });
  });

  it("ignores project channel fields in personal input and warns about each", async () => {
    const result = await updateNotificationPreferences(
      input({ alertSlack: true, alertWebhook: false, checkInApp: undefined }),
    );

    expect(result).toMatchObject({
      warnings: [
        { code: "deprecated_field", field: "alert_slack" },
        { code: "deprecated_field", field: "alert_webhook" },
      ],
    });
    const upsert = mocks.prisma.notificationPreference.upsert.mock.calls[0]?.[0];
    expect(upsert?.update).not.toHaveProperty("alertSlack");
    expect(upsert?.update).not.toHaveProperty("alertWebhook");
    expect(upsert?.create).not.toHaveProperty("alertSlack");
    expect(mocks.prisma.webhookEndpoint.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.slackConnection.update).not.toHaveBeenCalled();
  });
  it.each(["all", "important", "none"] as const)(
    "ignores old form echoes for stored %s",
    async (setting) => {
      for (const legacy of [false, true]) {
        const stored = {
          checkInApp: !legacy,
          checkNotificationSetting: setting,
          checkNotificationTopN: 33,
          checkNotificationPositionMove: 7,
        };
        mocks.prisma.notificationPreference.findUnique.mockResolvedValue(stored);
        mocks.prisma.notificationPreference.upsert.mockImplementation(({ update }) =>
          Promise.resolve({ ...stored, ...update }),
        );
        const result = await updateNotificationPreferences(input({ checkInApp: legacy }));
        expect(result).toMatchObject({
          checkInApp: setting !== "none",
          checkNotificationSetting: setting,
          checkNotificationTopN: 33,
          checkNotificationPositionMove: 7,
          warnings: [expect.objectContaining({ field: "check_in_app" })],
        });
        const write = mocks.prisma.notificationPreference.upsert.mock.lastCall?.[0];
        expect(write.create).not.toHaveProperty("checkInApp");
        expect(write.update).not.toHaveProperty("checkInApp");
        expect(write.update).not.toHaveProperty("checkNotificationSetting");
        expect(write.update).not.toHaveProperty("checkNotificationTopN");
        expect(write.update).not.toHaveProperty("checkNotificationPositionMove");
      }
    },
  );
  it("applies new setting and threshold fields while ignoring the legacy value", async () => {
    const result = await updateNotificationPreferences(
      input({
        checkInApp: true,
        checkNotificationSetting: "none",
        checkNotificationTopN: 1,
        checkNotificationPositionMove: 100,
      }),
    );
    expect(result).toMatchObject({
      checkInApp: false,
      checkNotificationSetting: "none",
      checkNotificationTopN: 1,
      checkNotificationPositionMove: 100,
    });
  });
  it.each(["checkNotificationTopN", "checkNotificationPositionMove"])(
    "rejects invalid %s before any write",
    async (field) => {
      for (const value of [0, 101, 1.5]) {
        await expect(updateNotificationPreferences(input({ [field]: value }))).rejects.toThrow();
        expect(mocks.prisma.notificationPreference.upsert).not.toHaveBeenCalled();
      }
    },
  );
  it("validates new check preferences even for a direct shared-service caller", async () => {
    const actor = {
      id: "user_1",
      memberships: [{ projectId: "project_1", role: "member" as const }],
    };
    for (const invalid of [
      { checkNotificationTopN: 0 },
      { checkNotificationPositionMove: 101 },
      { checkNotificationSetting: "everything" },
    ]) {
      await expect(
        applyNotificationPreferences(actor, input(invalid) as NotificationPreferencesForm),
      ).rejects.toMatchObject({ name: "ZodError" });
      expect(mocks.prisma.notificationPreference.upsert).not.toHaveBeenCalled();
    }
  });
  it("saves the provider-incident setting through the shared service without a legacy check write", async () => {
    await updateNotificationPreferences(
      input({ providerIncidentInApp: false, checkNotificationSetting: "important" }),
    );
    const write = mocks.prisma.notificationPreference.upsert.mock.calls[0][0];
    expect(write.create).toHaveProperty("providerIncidentInApp", false);
    expect(write.update).toHaveProperty("providerIncidentInApp", false);
    expect(write.update).not.toHaveProperty("checkInApp");
  });
});
