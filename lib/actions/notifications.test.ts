import { NotificationType } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNotification,
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotificationFeed,
} from "./notifications";

const mocks = vi.hoisted(() => ({
  getNotificationBellData: vi.fn(),
  prisma: {
    notification: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/queries/notifications", () => ({
  getNotificationBellData: mocks.getNotificationBellData,
}));

describe("notification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "member" }],
      role: "member",
    });
    mocks.prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue(null);
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      publicId: "prj_a00000000000000000000000",
      writeMode: "active",
    });
    mocks.getNotificationBellData.mockResolvedValue({ items: [], unreadCount: 0 });
  });

  it("returns the current authenticated notification feed for request polling", async () => {
    await expect(refreshNotificationFeed("project_1")).resolves.toEqual({
      items: [],
      unreadCount: 0,
    });

    expect(mocks.getNotificationBellData).toHaveBeenCalledWith("project_1");
  });

  it("rejects invalid mark-read input before resolving the actor", async () => {
    await expect(markNotificationRead({ notificationId: "" })).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("marks one current-user notification as read", async () => {
    const result = await markNotificationRead({
      notificationId: "ntf_a00000000000000000000000",
    });

    expect(result).toEqual({ updated: 1 });
    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
      data: { readAt: expect.any(Date) },
      where: {
        publicId: "ntf_a00000000000000000000000",
        readAt: null,
        userId: "user_1",
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("marks visible project and global notifications as read", async () => {
    await markAllNotificationsRead("prj_a00000000000000000000000");

    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
      data: { readAt: expect.any(Date) },
      where: {
        OR: [{ projectId: null }, { projectId: "project_1" }],
        readAt: null,
        userId: "user_1",
      },
    });
  });

  it("creates a durable notification with validated JSON payload", async () => {
    mocks.prisma.notification.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        createdAt: new Date("2026-06-28T10:00:00.000Z"),
        id: "notification_1",
        readAt: null,
      }),
    );

    const result = await createNotification(
      "user_2",
      "project_1",
      NotificationType.import_done,
      "Import complete",
      "42 keywords imported",
      { href: "/app/integrations", keywordCount: 42 },
    );

    expect(result).toMatchObject({
      body: "42 keywords imported",
      id: "notification_1",
      projectId: "project_1",
      title: "Import complete",
      type: "import_done",
      userId: "user_2",
    });
    expect(mocks.prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: { href: "/app/integrations", keywordCount: 42 },
          projectId: "project_1",
          type: "import_done",
          userId: "user_2",
        }),
      }),
    );
  });

  it("skips durable notifications when the in-app preference is disabled", async () => {
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({ importInApp: false });

    const result = await createNotification(
      "user_2",
      "project_1",
      NotificationType.import_done,
      "Import complete",
    );

    expect(result).toBeNull();
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });

  it("rejects invalid notification creation input", async () => {
    await expect(
      createNotification("user_2", null, NotificationType.system, "", null),
    ).rejects.toThrow();

    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });
});
