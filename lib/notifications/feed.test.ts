import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationFeedForScope } from "./feed";

const NOTIFICATION_PUBLIC_ID = "ntf_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  prisma: {
    notification: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    body: "Daily check done",
    createdAt: new Date("2026-06-28T10:00:00.000Z"),
    id: "notification_1",
    payload: { keywordId: "keyword_1" },
    project: {
      domain: "example.com",
      id: "project_1",
      name: "Example",
      publicId: PROJECT_PUBLIC_ID,
    },
    projectId: "project_1",
    publicId: NOTIFICATION_PUBLIC_ID,
    readAt: null,
    title: "Rank check complete",
    type: "check_complete",
    ...overrides,
  };
}

describe("notification feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.notification.findMany.mockResolvedValueOnce([notificationRow()]);
    mocks.prisma.notification.count.mockResolvedValue(1);
  });

  it("serializes only public notification and project IDs for realtime clients", async () => {
    const feed = await getNotificationFeedForScope(
      { activeProjectId: "project_1", userId: "user_1" },
      { limit: 1, now: new Date("2026-06-28T10:05:00.000Z") },
    );

    expect(feed).toEqual({
      items: [
        {
          body: "Daily check done",
          createdAt: "2026-06-28T10:00:00.000Z",
          href: appPath(PROJECT_PUBLIC_ID, "keywords"),
          id: NOTIFICATION_PUBLIC_ID,
          meta: "Daily check done",
          payload: { keywordId: "[redacted]" },
          projectId: PROJECT_PUBLIC_ID,
          readAt: null,
          time: "5m",
          title: "Rank check complete",
          type: "check_complete",
        },
      ],
      unreadCount: 1,
    });
    expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          publicId: true,
          project: { select: { domain: true, name: true, publicId: true } },
        }),
      }),
    );
  });

  it("fails closed when a notification public ID is unavailable", async () => {
    mocks.prisma.notification.findMany.mockReset();
    mocks.prisma.notification.findMany.mockResolvedValueOnce([notificationRow({ publicId: null })]);

    await expect(
      getNotificationFeedForScope({ activeProjectId: "project_1", userId: "user_1" }, { limit: 1 }),
    ).rejects.toThrow("Notification public ID is not available.");
  });
});
