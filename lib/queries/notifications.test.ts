import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationBellData, listCurrentUserNotifications } from "./notifications";

const NOTIFICATION_PUBLIC_ID = "ntf_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  getQueryActor: vi.fn(),
  prisma: {
    notification: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    project: { findFirst: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("./_auth", () => ({
  getQueryActor: mocks.getQueryActor,
}));

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    body: "Daily check done",
    createdAt: new Date("2026-06-28T10:00:00.000Z"),
    id: "notification_1",
    payload: null,
    project: {
      domain: "example.com",
      id: "project_1",
      name: "Example",
      publicId: PROJECT_PUBLIC_ID,
    },
    projectId: "project_1",
    readAt: null,
    publicId: NOTIFICATION_PUBLIC_ID,
    title: "Rank check complete",
    type: "check_complete",
    ...overrides,
  };
}

describe("notification queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getQueryActor.mockResolvedValue({ id: "user_1" });
    mocks.prisma.project.findFirst.mockResolvedValue({ id: "project_1" });
  });

  it("lists project notifications unread first and counts unread rows", async () => {
    const unread = notificationRow({
      id: "unread_1",
      publicId: NOTIFICATION_PUBLIC_ID,
    });
    const read = notificationRow({
      id: "read_1",
      publicId: "ntf_bbcdefghijklmnopqrstuvwx",
      readAt: new Date("2026-06-28T10:04:00.000Z"),
    });
    mocks.prisma.notification.findMany
      .mockResolvedValueOnce([unread])
      .mockResolvedValueOnce([read]);
    mocks.prisma.notification.count.mockResolvedValue(1);

    const result = await getNotificationBellData(PROJECT_PUBLIC_ID, {
      limit: 5,
      now: new Date("2026-06-28T10:05:00.000Z"),
    });

    expect(result.unreadCount).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual([
      NOTIFICATION_PUBLIC_ID,
      "ntf_bbcdefghijklmnopqrstuvwx",
    ]);
    expect(result.items[0]).toMatchObject({
      href: appPath("prj_abcdefghijklmnopqrstuvwx", "rank-tracker"),
      meta: "Daily check done",
      readAt: null,
      time: "5m",
    });
    expect(mocks.prisma.notification.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({
          OR: [{ projectId: null }, { projectId: "project_1" }],
          readAt: null,
          userId: "user_1",
        }),
      }),
    );
    expect(mocks.prisma.notification.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 4,
        where: expect.objectContaining({
          OR: [{ projectId: null }, { projectId: "project_1" }],
          readAt: { not: null },
          userId: "user_1",
        }),
      }),
    );
    expect(mocks.prisma.notification.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ projectId: null }, { projectId: "project_1" }],
        readAt: null,
        userId: "user_1",
      }),
    });
  });

  it("falls back to global notifications when there is no active project", async () => {
    mocks.prisma.notification.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await listCurrentUserNotifications(null, { limit: 2 });

    expect(mocks.prisma.notification.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: null,
          readAt: null,
          userId: "user_1",
        }),
      }),
    );
  });

  it("uses safe payload metadata and rejects external payload hrefs", async () => {
    mocks.prisma.notification.findMany.mockResolvedValueOnce([
      notificationRow({
        body: null,
        payload: { href: "https://example.com/bad", meta: "Provider import" },
        type: "import_failed",
      }),
    ]);
    mocks.prisma.notification.count.mockResolvedValue(1);

    const result = await getNotificationBellData(PROJECT_PUBLIC_ID, {
      limit: 1,
      now: new Date("2026-06-28T10:00:30.000Z"),
    });

    expect(result.items[0]).toMatchObject({
      href: appPath("prj_abcdefghijklmnopqrstuvwx", "integrations"),
      meta: "Provider import",
      time: "now",
    });
    expect(mocks.prisma.notification.findMany).toHaveBeenCalledTimes(1);
  });
});
