import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimAlertDeliveryActivity,
  loadAlertDeliveryContextActivity,
  sweepAlertDeliveriesActivity,
} from "./alert-delivery-context";

const mocks = vi.hoisted(() => ({
  startAlertDeliveryWorkflow: vi.fn(),
  prisma: {
    notificationPreference: { findMany: vi.fn() },
    triggeredAlert: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./alert-delivery-client", () => ({
  startAlertDeliveryWorkflow: mocks.startAlertDeliveryWorkflow,
}));

const publicId = (prefix: string) => `${prefix}_a${"0".repeat(23)}`;

describe("alert delivery context", () => {
  const ownedInput = { alertId: "alert_1", deliveryClaimToken: "claim_1" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.notificationPreference.findMany.mockResolvedValue([]);
    mocks.startAlertDeliveryWorkflow.mockResolvedValue(undefined);
  });

  it.each(["pending", "delivering"])("claim transitions %s to delivering", async () => {
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 1 });
    await expect(claimAlertDeliveryActivity(ownedInput)).resolves.toEqual({
      claimed: true,
    });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: {
        deliveryClaimedAt: expect.any(Date),
        deliveryClaimToken: "claim_1",
        deliveryState: "delivering",
      },
      where: {
        AND: [
          {
            OR: [
              { deliveryState: "pending" },
              { deliveryClaimToken: "claim_1", deliveryState: "delivering" },
              {
                deliveryClaimedAt: { lt: expect.any(Date) },
                deliveryState: "delivering",
              },
            ],
          },
          {
            OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
            status: { not: "resolved" },
          },
        ],
        id: "alert_1",
      },
    });
  });

  it.each(["delivered", "dead_letter"])("claim refuses terminal %s rows", async () => {
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 0 });
    await expect(claimAlertDeliveryActivity(ownedInput)).resolves.toEqual({
      claimed: false,
    });
  });

  it("claim refuses a resolved or snoozed alert", async () => {
    mocks.prisma.triggeredAlert.updateMany.mockImplementation((input) => {
      if (input.data.deliveryState === "skipped") return Promise.resolve({ count: 1 });
      return Promise.resolve({ count: 0 });
    });

    await expect(claimAlertDeliveryActivity(ownedInput)).resolves.toEqual({
      claimed: false,
    });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: {
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "skipped",
      },
      where: {
        AND: [
          {
            OR: [
              { deliveryState: "pending" },
              { deliveryClaimToken: "claim_1", deliveryState: "delivering" },
            ],
          },
          {
            NOT: {
              OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
              status: { not: "resolved" },
            },
          },
        ],
        id: "alert_1",
      },
    });
  });

  it("loads every project endpoint and configured rule recipient", async () => {
    mocks.prisma.notificationPreference.findMany.mockResolvedValue([
      { alertEmail: false, userId: "user_1" },
    ]);
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue({
      afterPosition: 14,
      beforePosition: 8,
      firedAt: new Date("2026-07-21T20:00:00.000Z"),
      id: "alert_1",
      publicId: publicId("al"),
      keyword: {
        project: {
          domain: "example.com",
          id: "project_1",
          publicId: publicId("prj"),
          slackConnection: { enabled: true, id: "slack_1" },
          webhookEndpoints: [{ id: "webhook_1" }],
        },
        publicId: publicId("kw"),
        text: "rank tracker",
      },
      payload: { action: "Review it.", headline: "Ranking dropped" },
      rule: {
        channels: ["email", "slack", "webhook"],
        conditionType: "exits_top_n",
        createdBy: { email: "owner@example.com", id: "user_1" },
        id: "rule_1",
        name: "Drop",
        publicId: publicId("alr"),
        recipients: [
          { user: { email: "owner@example.com", id: "user_1" } },
          { user: { email: "second@example.com", id: "user_2" } },
        ],
      },
    });

    await expect(loadAlertDeliveryContextActivity(ownedInput)).resolves.toMatchObject({
      payload: expect.objectContaining({ alertId: publicId("al"), keywordId: publicId("kw") }),
      recipients: [{ email: "second@example.com", userId: "user_2" }],
      projectInternalId: "project_1",
      slackConnectionId: "slack_1",
      triggeredAlertId: "alert_1",
      webhookEndpointIds: ["webhook_1"],
    });
    expect(mocks.prisma.triggeredAlert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          keyword: {
            select: expect.objectContaining({
              project: {
                select: expect.objectContaining({
                  webhookEndpoints: { select: { id: true } },
                }),
              },
            }),
          },
        }),
      }),
    );
  });

  it("load terminalizes an owned alert that becomes ineligible", async () => {
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue(null);
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 1 });

    await expect(loadAlertDeliveryContextActivity(ownedInput)).resolves.toBeNull();
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: {
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "skipped",
      },
      where: expect.objectContaining({
        deliveryClaimToken: "claim_1",
        deliveryState: "delivering",
        id: "alert_1",
        NOT: expect.objectContaining({ status: { not: "resolved" } }),
      }),
    });
  });

  it("sweeps stale pending and delivering alerts and swallows start failures", async () => {
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([{ id: "alert_1" }, { id: "alert_2" }]);
    mocks.startAlertDeliveryWorkflow.mockRejectedValueOnce(new Error("already started"));

    await expect(sweepAlertDeliveriesActivity()).resolves.toEqual({ scanned: 2, started: 1 });
    expect(mocks.startAlertDeliveryWorkflow).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.triggeredAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { firedAt: "asc" }, take: 100 }),
    );
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryState: "skipped" }),
        where: expect.objectContaining({
          AND: expect.arrayContaining([expect.objectContaining({ NOT: expect.any(Object) })]),
        }),
      }),
    );
  });
});
