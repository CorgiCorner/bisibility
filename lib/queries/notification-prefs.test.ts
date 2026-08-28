import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationPreferences, readNotificationPreferencesFor } from "./notification-prefs";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getQueryActor: vi.fn(),
  prisma: {
    notificationPreference: { findUnique: vi.fn() },
    project: { findFirst: vi.fn() },
    slackConnection: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    webhookEndpoint: { count: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("./_auth", () => ({ getQueryActor: mocks.getQueryActor }));

describe("notification preference queries", () => {
  const actor = { id: "user_1" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockReset();
    mocks.getQueryActor.mockResolvedValue(actor);
    mocks.prisma.project.findFirst.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.prisma.user.findUnique.mockResolvedValue({
      email: "owner@example.com",
      emailVerified: true,
    });
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue(null);
    mocks.prisma.slackConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(0);
  });

  it("authorizes the supplied actor before reading preferences", async () => {
    await readNotificationPreferencesFor(actor, "prj_1");

    expect(mocks.authorize).toHaveBeenCalledWith(actor, "read", {
      projectId: "project_1",
      type: "project",
    });
  });

  it("does not read preferences when authorization is denied", async () => {
    mocks.authorize.mockImplementation(() => {
      throw new Error("Access denied.");
    });

    await expect(readNotificationPreferencesFor(actor, "prj_1")).rejects.toThrow("Access denied.");

    expect(mocks.prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
  });

  it("returns model defaults when the user has no row yet", async () => {
    const result = await getNotificationPreferences("prj_1");

    expect(mocks.getQueryActor).toHaveBeenCalledOnce();
    expect(mocks.authorize).toHaveBeenCalledWith(actor, "read", {
      projectId: "project_1",
      type: "project",
    });

    expect(result).toMatchObject({
      alertEmail: true,
      alertInApp: true,
      alertSlack: false,
      alertWebhook: false,
      checkEmail: false,
      checkInApp: false,
      email: "owner@example.com",
      emailVerification: "verified",
      importEmail: true,
      importInApp: true,
      inviteEmail: true,
      inviteInApp: true,
      projectId: "prj_1",
      reportEmail: true,
      slackAvailable: false,
      webhookAvailable: false,
    });
  });

  it("maps stored preferences and project delivery channel state", async () => {
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({
      alertEmail: false,
      alertInApp: false,
      checkEmail: true,
      checkInApp: false,
      importEmail: false,
      importInApp: true,
      inviteEmail: true,
      inviteInApp: false,
      reportEmail: false,
    });
    mocks.prisma.slackConnection.findUnique.mockResolvedValue({ enabled: true });
    mocks.prisma.webhookEndpoint.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);

    const result = await getNotificationPreferences("prj_1");

    expect(result).toMatchObject({
      alertEmail: false,
      alertInApp: false,
      alertSlack: true,
      alertWebhook: true,
      checkEmail: true,
      checkInApp: false,
      importEmail: false,
      inviteInApp: false,
      reportEmail: false,
      slackAvailable: true,
      webhookAvailable: true,
    });
  });
});
