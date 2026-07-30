import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordSuppressed,
  reserveDeliveryBudgetOnce,
  reserveRuleDailyBudget,
  utcDay,
} from "./daily-cap";
import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "./limits";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    alertRuleDailyStat: {
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    triggeredAlert: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("alert daily delivery cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.alertRuleDailyStat.upsert.mockResolvedValue({});
    mocks.prisma.alertRuleDailyStat.update.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation((work) => work(mocks.prisma));
  });

  it("grants budget through the limit and denies the next delivery", async () => {
    let sent = 0;
    mocks.prisma.alertRuleDailyStat.updateMany.mockImplementation(({ data }) => {
      if (data.sentCount && sent < MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY) {
        sent += 1;
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    });
    const now = new Date("2026-07-21T23:59:00.000Z");

    for (let index = 0; index < MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY; index += 1) {
      await expect(reserveRuleDailyBudget("rule_1", now)).resolves.toBe(true);
    }
    await expect(reserveRuleDailyBudget("rule_1", now)).resolves.toBe(false);
  });

  it("uses independent UTC dates", async () => {
    mocks.prisma.alertRuleDailyStat.updateMany.mockResolvedValue({ count: 1 });

    await reserveRuleDailyBudget("rule_1", new Date("2026-07-21T23:59:00.000Z"));
    await reserveRuleDailyBudget("rule_1", new Date("2026-07-22T00:01:00.000Z"));

    expect(mocks.prisma.alertRuleDailyStat.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { ruleId_day: { day: utcDay(new Date("2026-07-21")), ruleId: "rule_1" } },
      }),
    );
    expect(mocks.prisma.alertRuleDailyStat.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { ruleId_day: { day: utcDay(new Date("2026-07-22")), ruleId: "rule_1" } },
      }),
    );
  });

  it("makes the overflow notice due only once", async () => {
    mocks.prisma.alertRuleDailyStat.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const now = new Date("2026-07-21T12:00:00.000Z");

    await expect(recordSuppressed("rule_1", now, 3)).resolves.toEqual({
      overflowNoticeDue: true,
    });
    await expect(recordSuppressed("rule_1", now, 2)).resolves.toEqual({
      overflowNoticeDue: false,
    });
  });

  it("reuses an alert reservation across activity retries", async () => {
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.prisma.alertRuleDailyStat.updateMany.mockResolvedValue({ count: 1 });
    const input = {
      alertId: "alert_1",
      deliveryState: "delivering" as const,
      now: new Date("2026-07-21T12:00:00.000Z"),
      ruleId: "rule_1",
    };

    await expect(reserveDeliveryBudgetOnce(input)).resolves.toEqual({
      granted: true,
      reused: false,
    });

    mocks.prisma.triggeredAlert.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.prisma.triggeredAlert.findUnique.mockResolvedValue({
      deliveryBudgetReservedAt: input.now,
    });
    await expect(reserveDeliveryBudgetOnce(input)).resolves.toEqual({
      granted: true,
      reused: true,
    });
    expect(mocks.prisma.alertRuleDailyStat.updateMany).toHaveBeenCalledOnce();
  });
});
