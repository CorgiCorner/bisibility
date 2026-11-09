import { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNotification } from "./create";
import { notificationTransaction } from "./transaction";

const mocks = vi.hoisted(() => ({
  receipt: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    project: { findFirst: vi.fn() },
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
  },
  publishNotificationCreated: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: mocks.receipt }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./realtime", () => ({
  publishNotificationCreated: mocks.publishNotificationCreated,
}));

describe("notification creation", () => {
  it.each([
    [NotificationType.alert_fired, "alertInApp"],
    [NotificationType.import_done, "importInApp"],
    [NotificationType.invite, "inviteInApp"],
  ])("respects ON/OFF through persistence and realtime for %s", async (type, preference) => {
    for (const enabled of [false, true]) {
      mocks.prisma.notification.create.mockClear();
      mocks.publishNotificationCreated.mockClear();
      mocks.prisma.notificationPreference.findUnique.mockResolvedValue({ [preference]: enabled });
      await createNotification("user_1", "project_1", type, "Fixture event");
      expect(mocks.prisma.notification.create).toHaveBeenCalledTimes(enabled ? 1 : 0);
      expect(mocks.publishNotificationCreated).toHaveBeenCalledTimes(enabled ? 1 : 0);
    }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (callback: (db: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma),
    );
    mocks.prisma.project.findFirst.mockResolvedValue({ id: "project_1" });
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

  it("respects provider-incident ON/OFF through persistence and realtime", async () => {
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    try {
      for (const enabled of [false, true]) {
        mocks.prisma.notification.create.mockClear();
        mocks.publishNotificationCreated.mockClear();
        mocks.prisma.notificationPreference.findUnique.mockResolvedValue({
          providerIncidentInApp: enabled,
        });
        await createNotification(
          "user_1",
          "project_1",
          NotificationType.provider_incident,
          "Fixture event",
        );
        expect(mocks.prisma.notification.create).toHaveBeenCalledTimes(enabled ? 1 : 0);
        expect(mocks.publishNotificationCreated).toHaveBeenCalledTimes(enabled ? 1 : 0);
      }
    } finally {
      vi.unstubAllEnvs();
    }
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

  it("records a nonempty delivered alert, after its durable row", async () => {
    await createNotification(
      "user_1",
      "project_1",
      NotificationType.alert_fired,
      "Ranking alert",
      null,
      { afterPosition: 2 },
    );
    expect(mocks.receipt).toHaveBeenCalledWith({
      userId: "user_1",
      surface: "alert",
      nonEmpty: true,
    });
    expect(mocks.prisma.notification.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.receipt.mock.invocationCallOrder[0],
    );
  });
  it.each([false, true])(
    "external transaction rollback=%s gates result receipts",
    async (rollback) => {
      const tx = {
        ...mocks.prisma,
        notification: {
          createManyAndReturn: vi.fn(async ({ data }) => [
            {
              ...data,
              id: "n1",
              createdAt: new Date("2026-11-05T00:00:00Z"),
            },
          ]),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (persist) => {
        const result = await persist(tx);
        expect(mocks.receipt).not.toHaveBeenCalled();
        if (rollback) throw new Error("commit rejected");
        return result;
      });
      const run = notificationTransaction((client) =>
        createNotification(
          "user_1",
          "project_1",
          NotificationType.alert_fired,
          "Ranking alert",
          null,
          { afterPosition: 2 },
          "alert:1",
          client,
        ),
      );
      if (rollback) await expect(run).rejects.toThrow("commit rejected");
      else {
        await run;
        expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith({
          userId: "user_1",
          surface: "alert",
          nonEmpty: true,
        });
      }
      if (rollback) expect(mocks.receipt).not.toHaveBeenCalled();
    },
  );
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
    expect(mocks.receipt).not.toHaveBeenCalled();
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
    expect(mocks.receipt).not.toHaveBeenCalled();
  });

  it.each([
    "alert_fired",
    "check_complete",
    "check_failed",
    "import_done",
    "import_failed",
  ] as const)(
    "rejects %s without project scope while allowing account system notices",
    async (type) => {
      await expect(createNotification("user_1", null, type, "Project notice")).resolves.toBeNull();
      expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
      await expect(
        createNotification("user_1", null, "system", "Account notice"),
      ).resolves.toMatchObject({ id: "notification_1" });
    },
  );
});
