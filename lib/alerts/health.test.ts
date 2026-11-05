import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AlertHealthConfig,
  collectAlertDeliveryHealth,
  collectAlertFireSpikes,
} from "./health";

const mocks = vi.hoisted(() => ({
  prisma: {
    alertRule: { findMany: vi.fn() },
    deliveryAttempt: { groupBy: vi.fn() },
    triggeredAlert: { groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const config: AlertHealthConfig = {
  failureRateThreshold: 0.25,
  minAttempts: 10,
  spikeMin: 20,
  spikeMultiplier: 3,
  windowHours: 24,
};

describe("alert health", () => {
  it("separates partial batch attempts from measured recipient completeness", async () => {
    mocks.prisma.deliveryAttempt.groupBy.mockResolvedValue([
      {
        _count: 1,
        _sum: { acceptedCount: 1, failedCount: 1, unknownCount: 1 },
        channel: "push",
        failedCount: 1,
        status: "partial",
        unknownCount: 1,
      },
    ]);
    await expect(collectAlertDeliveryHealth(new Date(), config)).resolves.toMatchObject({
      total: 1,
      partial: 1,
      failed: 1,
      unknown: 1,
      failureRate: 1,
      perChannel: { push: { total: 1, failed: 1, unknown: 1, sent: 0, skipped: 0 } },
      recipientCounts: { acceptedCount: 1, failedCount: 1, unknownCount: 1 },
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      { id: "rule_1", name: "Rule one", projectId: "project_1" },
    ]);
  });

  it("alarms at the configured delivery failure threshold and minimum", async () => {
    mocks.prisma.deliveryAttempt.groupBy.mockResolvedValue([
      { _count: 3, channel: "email", status: "failed" },
      { _count: 9, channel: "email", status: "sent" },
    ]);
    await expect(
      collectAlertDeliveryHealth(new Date("2026-07-21T12:00:00Z"), config),
    ).resolves.toMatchObject({ alarm: true, failed: 3, failureRate: 0.25, total: 12 });

    mocks.prisma.deliveryAttempt.groupBy.mockResolvedValue([
      { _count: 2, channel: "email", status: "failed" },
      { _count: 4, channel: "email", status: "sent" },
    ]);
    await expect(
      collectAlertDeliveryHealth(new Date("2026-07-21T12:00:00Z"), config),
    ).resolves.toMatchObject({ alarm: false, total: 6 });
  });

  it("does not alarm when all twelve email deliveries were skipped", async () => {
    mocks.prisma.deliveryAttempt.groupBy.mockResolvedValue([
      { _count: 12, channel: "email", status: "skipped" },
    ]);

    await expect(
      collectAlertDeliveryHealth(new Date("2026-07-21T12:00:00Z"), config),
    ).resolves.toMatchObject({
      alarm: false,
      failed: 0,
      failureRate: 0,
      perChannel: { email: { failed: 0, sent: 0, skipped: 12, total: 0 } },
      total: 0,
    });
  });

  it("does not alarm when every attempt in the window is unknown", async () => {
    mocks.prisma.deliveryAttempt.groupBy.mockResolvedValue([
      { _count: 12, channel: "email", status: "unknown" },
    ]);
    await expect(
      collectAlertDeliveryHealth(new Date("2026-07-21T12:00:00Z"), config),
    ).resolves.toMatchObject({
      alarm: false,
      failed: 0,
      failureRate: 0,
      total: 12,
      unknown: 12,
    });
  });

  it("shows unknown attempts without counting them as failures or skipped", async () => {
    mocks.prisma.deliveryAttempt.groupBy.mockResolvedValue([
      { _count: 2, channel: "email", status: "unknown" },
      { _count: 1, channel: "email", status: "failed" },
      { _count: 1, channel: "email", status: "sent" },
    ]);
    await expect(
      collectAlertDeliveryHealth(new Date("2026-07-21T12:00:00Z"), config),
    ).resolves.toMatchObject({
      failed: 1,
      failureRate: 1 / 4,
      perChannel: { email: { failed: 1, sent: 1, skipped: 0, total: 4, unknown: 2 } },
      total: 4,
      unknown: 2,
    });
  });

  it("skipped attempts do not dilute the failure rate", async () => {
    mocks.prisma.deliveryAttempt.groupBy.mockResolvedValue([
      { _count: 40, channel: "email", status: "skipped" },
      { _count: 10, channel: "email", status: "failed" },
      { _count: 5, channel: "email", status: "sent" },
    ]);

    await expect(
      collectAlertDeliveryHealth(new Date("2026-07-21T12:00:00Z"), config),
    ).resolves.toMatchObject({
      alarm: true,
      failureRate: 10 / 15,
      perChannel: { email: { failed: 10, sent: 5, skipped: 40, total: 15 } },
      total: 15,
    });
  });

  it.each([
    [30, 14, 1],
    [30, 105, 0],
    [5, 0, 0],
  ])("evaluates today %s against trailing total %s", async (today, trailing, expected) => {
    mocks.prisma.triggeredAlert.groupBy
      .mockResolvedValueOnce([{ _count: today, ruleId: "rule_1" }])
      .mockResolvedValueOnce([{ _count: trailing, ruleId: "rule_1" }]);
    const now = new Date("2026-07-21T12:00:00Z");

    await expect(collectAlertFireSpikes(now, config)).resolves.toHaveLength(expected);
    const todayStart = new Date("2026-07-21T00:00:00Z");
    expect(mocks.prisma.triggeredAlert.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          firedAt: {
            gte: new Date(todayStart.getTime() - 7 * 86_400_000),
            lt: todayStart,
          },
        },
      }),
    );
  });
});
