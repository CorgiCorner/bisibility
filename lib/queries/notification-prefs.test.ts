import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationPreferences } from "./notification-prefs";

const mocks = vi.hoisted(() => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn() },
    slackConnection: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    webhookEndpoint: { count: vi.fn() },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("notification preference queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1" },
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.prisma.user.findUnique.mockResolvedValue({
      email: "owner@example.com",
      emailVerified: true,
    });
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue(null);
    mocks.prisma.slackConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(0);
  });

  it("returns model defaults when the user has no row yet", async () => {
    const result = await getNotificationPreferences("prj_1");

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
