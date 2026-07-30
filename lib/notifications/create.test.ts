import { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNotification } from "./create";

const mocks = vi.hoisted(() => ({
  prisma: {
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
  },
  publishNotificationCreated: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./realtime", () => ({
  publishNotificationCreated: mocks.publishNotificationCreated,
}));

describe("notification creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue(null);
    mocks.prisma.notification.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        createdAt: new Date("2026-07-21T00:00:00.000Z"),
        id: "notification_1",
        readAt: null,
      }),
    );
  });

  it("check_complete is opt-in when no preference row exists", async () => {
    const result = await createNotification(
      "user_1",
      "project_1",
      NotificationType.check_complete,
      "Rank check complete",
    );

    expect(result).toBeNull();
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });

  it("explicit checkInApp opt-in still creates the notification", async () => {
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({ checkInApp: true });

    const result = await createNotification(
      "user_1",
      "project_1",
      NotificationType.check_complete,
      "Rank check complete",
    );

    expect(result).toMatchObject({ id: "notification_1" });
    expect(mocks.prisma.notification.create).toHaveBeenCalledOnce();
    expect(mocks.publishNotificationCreated).toHaveBeenCalledOnce();
  });

  it("alert_fired defaults on without a preference row", async () => {
    const result = await createNotification(
      "user_1",
      "project_1",
      NotificationType.alert_fired,
      "Ranking alert",
    );

    expect(result).toMatchObject({ id: "notification_1" });
    expect(mocks.prisma.notification.create).toHaveBeenCalledOnce();
  });

  it("alert_fired respects alertInApp=false", async () => {
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({ alertInApp: false });

    const result = await createNotification(
      "user_1",
      "project_1",
      NotificationType.alert_fired,
      "Ranking alert",
    );

    expect(result).toBeNull();
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
    expect(mocks.publishNotificationCreated).not.toHaveBeenCalled();
  });

  it("idempotencyKey is persisted on the column", async () => {
    await createNotification(
      "user_1",
      "project_1",
      NotificationType.alert_fired,
      "Ranking alert",
      null,
      { idempotencyKey: "rank-check:rc_1:complete" },
      "rank-check:rc_1:complete",
    );

    expect(mocks.prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: "rank-check:rc_1:complete" }),
      }),
    );
  });

  it("unique violation is treated as dedup", async () => {
    mocks.prisma.notification.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        clientVersion: "7.8.0",
        code: "P2002",
      }),
    );

    await expect(
      createNotification(
        "user_1",
        "project_1",
        NotificationType.alert_fired,
        "Ranking alert",
        null,
        undefined,
        "triggered-alert:alert_1:delivered",
      ),
    ).resolves.toBeNull();
    expect(mocks.publishNotificationCreated).not.toHaveBeenCalled();
  });
});
