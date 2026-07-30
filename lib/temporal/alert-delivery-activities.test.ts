import { ApplicationFailure } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryHttpError, type TriggeredAlertDeliveryPayload } from "../alerts/delivery";
import { PRIVATE_NETWORK_WEBHOOK_ERROR } from "../alerts/webhook-target";
import { EmailBudgetExceededError, EmailSendError } from "../email/send";
import {
  deliverAlertEmailActivity,
  deliverAlertSlackActivity,
  deliverAlertWebhookActivity,
  finalizeAlertDeliveryActivity,
  reserveAlertDeliveryBudgetActivity,
} from "./alert-delivery-activities";

const mocks = vi.hoisted(() => ({
  notifyTriggeredAlertDelivered: vi.fn(() => Promise.resolve()),
  postSignedWebhook: vi.fn(() => Promise.resolve()),
  recordSuppressed: vi.fn(),
  reserveDeliveryBudgetOnce: vi.fn(),
  sendEmail: vi.fn(),
  prisma: {
    deliveryAttempt: { create: vi.fn((_input?: unknown) => Promise.resolve({})) },
    notificationPreference: { findMany: vi.fn() },
    triggeredAlert: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(() => Promise.resolve({})),
      updateMany: vi.fn(),
    },
    webhookEndpoint: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
  sendAlertEmail: vi.fn(() => Promise.resolve()),
  sendSlackAlert: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../alerts/delivery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../alerts/delivery")>()),
  postSignedWebhook: mocks.postSignedWebhook,
  recordDeliveryAttempt: vi.fn((alertId, channel, status, error, webhookEndpointId) =>
    mocks.prisma.deliveryAttempt.create({
      data: {
        alertId,
        channel,
        error,
        status,
        triggeredAlertId: alertId,
        ...(webhookEndpointId ? { webhookEndpointId } : {}),
      },
    }),
  ),
  sendAlertEmail: mocks.sendAlertEmail,
  sendSlackAlert: mocks.sendSlackAlert,
}));
vi.mock("../alerts/daily-cap", () => ({
  recordSuppressed: mocks.recordSuppressed,
  reserveDeliveryBudgetOnce: mocks.reserveDeliveryBudgetOnce,
}));
vi.mock("../email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../email/send")>()),
  sendEmail: mocks.sendEmail,
}));
vi.mock("../notifications/events", () => ({
  notifyTriggeredAlertDelivered: mocks.notifyTriggeredAlertDelivered,
}));

const publicId = (prefix: string) => `${prefix}_a${"0".repeat(23)}`;

function payload(): TriggeredAlertDeliveryPayload {
  return {
    action: "Review it.",
    afterPosition: 14,
    alertId: publicId("al"),
    beforePosition: 8,
    conditionType: "exits_top_n",
    firedAt: "2026-07-21T20:00:00.000Z",
    headline: "Ranking dropped",
    keyword: "rank tracker",
    keywordId: publicId("kw"),
    projectDomain: "example.com",
    projectId: publicId("prj"),
    ruleId: publicId("alr"),
    ruleName: "Drop",
  };
}

describe("alert delivery activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_FROM", "Bisibility <alerts@example.com>");
    mocks.prisma.deliveryAttempt.create.mockResolvedValue({});
    mocks.prisma.notificationPreference.findMany.mockResolvedValue([]);
    mocks.prisma.triggeredAlert.update.mockResolvedValue({});
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.webhookEndpoint.updateMany.mockResolvedValue({ count: 1 });
    mocks.sendAlertEmail.mockResolvedValue();
    mocks.sendSlackAlert.mockResolvedValue(true);
    mocks.postSignedWebhook.mockResolvedValue();
    mocks.notifyTriggeredAlertDelivered.mockResolvedValue();
    mocks.recordSuppressed.mockResolvedValue({ overflowNoticeDue: false });
    mocks.reserveDeliveryBudgetOnce.mockResolvedValue({ granted: true, reused: false });
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  it("maps a 429 to retryable rate limiting with nextRetryDelay", async () => {
    mocks.sendAlertEmail.mockRejectedValue(new EmailSendError("rate limited", 429, 30));
    const error = await deliverAlertEmailActivity({
      alertId: "alert_1",
      payload: payload(),
      recipientEmail: "owner@example.com",
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error).toMatchObject({ nonRetryable: false, type: "rate_limited" });
    expect(String(error.nextRetryDelay)).toContain("30");
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledOnce();
  });

  it("records global email-budget exhaustion and makes it non-retryable", async () => {
    const budgetError = new EmailBudgetExceededError(
      "bulk",
      1_000,
      new Date("2026-07-23T00:00:00.000Z"),
    );
    mocks.sendAlertEmail.mockRejectedValue(budgetError);

    await expect(
      deliverAlertEmailActivity({
        alertId: "alert_1",
        payload: payload(),
        recipientEmail: "owner@example.com",
      }),
    ).rejects.toMatchObject({
      message: budgetError.message,
      nonRetryable: true,
      type: "email_budget_exceeded",
    });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "email",
        error: budgetError.message,
        status: "failed",
      }),
    });
  });

  it("suppresses manual delivery over budget without sending overflow email", async () => {
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue({
      keyword: {
        project: {
          id: "project_1",
          publicId: publicId("prj"),
          slackConnection: null,
          webhookEndpoints: [],
        },
      },
      rule: {
        channels: ["email"],
        createdBy: { email: "owner@example.com", id: "user_1" },
        id: "rule_1",
        name: "Drop",
        publicId: publicId("alr"),
        recipients: [{ user: { email: "second@example.com", id: "user_2" } }],
      },
    });
    mocks.reserveDeliveryBudgetOnce.mockResolvedValue({ granted: false, reused: false });
    mocks.recordSuppressed.mockResolvedValue({ overflowNoticeDue: true });
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      reserveAlertDeliveryBudgetActivity({
        alertId: "alert_1",
        deliveryClaimToken: "claim_1",
      }),
    ).resolves.toEqual({
      granted: false,
    });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: {
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "suppressed",
      },
      where: {
        deliveryClaimToken: "claim_1",
        deliveryState: "delivering",
        id: "alert_1",
      },
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("maps a 422 to a non-retryable failure", async () => {
    mocks.sendAlertEmail.mockRejectedValue(new EmailSendError("invalid", 422, null));
    const error = await deliverAlertEmailActivity({
      alertId: "alert_1",
      payload: payload(),
      recipientEmail: "owner@example.com",
    }).catch((caught) => caught);
    expect(error).toMatchObject({ nonRetryable: true });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledOnce();
  });

  it("leaves a 5xx retryable and records one attempt", async () => {
    const transportError = new EmailSendError("temporary", 503, null);
    mocks.sendAlertEmail.mockRejectedValue(transportError);
    await expect(
      deliverAlertEmailActivity({
        alertId: "alert_1",
        payload: payload(),
        recipientEmail: "owner@example.com",
      }),
    ).rejects.toBe(transportError);
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledOnce();
  });

  it("records successful email, webhook, and Slack executions exactly once", async () => {
    mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue({
      enabled: true,
      hmacSecret: "secret",
      id: "webhook_1",
      url: "https://example.com/hook",
    });
    await deliverAlertEmailActivity({
      alertId: "alert_1",
      payload: payload(),
      recipientEmail: "owner@example.com",
    });
    await deliverAlertWebhookActivity({
      alertId: "alert_1",
      endpointId: "webhook_1",
      payload: payload(),
    });
    await deliverAlertSlackActivity({
      alertId: "alert_1",
      payload: payload(),
      slackConnectionId: "slack_1",
    });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.webhookEndpoint.updateMany).toHaveBeenCalledWith({
      data: { lastDeliveryAt: expect.any(Date) },
      where: { id: "webhook_1" },
    });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "webhook",
        status: "sent",
        webhookEndpointId: "webhook_1",
      }),
    });
  });

  it("does not record a dangling endpoint id when the webhook was deleted", async () => {
    mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue(null);

    await expect(
      deliverAlertWebhookActivity({
        alertId: "alert_1",
        endpointId: "deleted_webhook",
        payload: payload(),
      }),
    ).rejects.toMatchObject({ nonRetryable: true });

    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ webhookEndpointId: expect.any(String) }),
    });
  });

  it("records a disabled endpoint as a permanent failed attempt without posting", async () => {
    mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue({
      enabled: false,
      hmacSecret: "secret",
      id: "webhook_1",
      url: "https://example.com/hook",
    });

    await expect(
      deliverAlertWebhookActivity({
        alertId: "alert_1",
        endpointId: "webhook_1",
        payload: payload(),
      }),
    ).rejects.toMatchObject({ nonRetryable: true });
    expect(mocks.postSignedWebhook).not.toHaveBeenCalled();
    expect(mocks.prisma.webhookEndpoint.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: {
        alertId: "alert_1",
        channel: "webhook",
        error: "Webhook delivery is not configured.",
        status: "failed",
        triggeredAlertId: "alert_1",
        webhookEndpointId: "webhook_1",
      },
    });
  });

  it.each([
    ["webhook", 30],
    ["slack", 45],
  ] as const)("maps %s HTTP 429 failures to provider-directed retries", async (channel, delay) => {
    const transportError = new DeliveryHttpError(`${channel} rate limited`, 429, delay);
    if (channel === "webhook") {
      mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue({
        enabled: true,
        hmacSecret: "secret",
        id: "webhook_1",
        url: "https://example.com/hook",
      });
      mocks.postSignedWebhook.mockRejectedValueOnce(transportError);
    } else {
      mocks.sendSlackAlert.mockRejectedValueOnce(transportError);
    }

    const error = await (channel === "webhook"
      ? deliverAlertWebhookActivity({
          alertId: "alert_1",
          endpointId: "webhook_1",
          payload: payload(),
        })
      : deliverAlertSlackActivity({
          alertId: "alert_1",
          payload: payload(),
          slackConnectionId: "slack_1",
        })
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error).toMatchObject({ nonRetryable: false, type: "rate_limited" });
    expect(String(error.nextRetryDelay)).toContain(String(delay));
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel,
        error: `${channel} rate limited`,
        status: "failed",
        ...(channel === "webhook" ? { webhookEndpointId: "webhook_1" } : {}),
      }),
    });
    expect(mocks.prisma.webhookEndpoint.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["webhook", 422, true],
    ["slack", 422, true],
    ["webhook", 503, false],
    ["slack", 503, false],
  ] as const)(
    "keeps %s status %s classification unchanged",
    async (channel, status, nonRetryable) => {
      const transportError = new DeliveryHttpError(`${channel} status ${status}`, status, null);
      if (channel === "webhook") {
        mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue({
          enabled: true,
          hmacSecret: "secret",
          id: "webhook_1",
          url: "https://example.com/hook",
        });
        mocks.postSignedWebhook.mockRejectedValueOnce(transportError);
      } else {
        mocks.sendSlackAlert.mockRejectedValueOnce(transportError);
      }

      const delivery =
        channel === "webhook"
          ? deliverAlertWebhookActivity({
              alertId: "alert_1",
              endpointId: "webhook_1",
              payload: payload(),
            })
          : deliverAlertSlackActivity({
              alertId: "alert_1",
              payload: payload(),
              slackConnectionId: "slack_1",
            });

      if (nonRetryable) {
        await expect(delivery).rejects.toMatchObject({ nonRetryable: true });
      } else {
        await expect(delivery).rejects.toBe(transportError);
      }
      expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledOnce();
    },
  );

  it("maps private webhook targets and Slack API errors to non-retryable failures", async () => {
    mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue({
      enabled: true,
      hmacSecret: "secret",
      id: "webhook_1",
      url: "https://example.com/hook",
    });
    mocks.postSignedWebhook.mockRejectedValueOnce(new Error(PRIVATE_NETWORK_WEBHOOK_ERROR));
    await expect(
      deliverAlertWebhookActivity({
        alertId: "alert_1",
        endpointId: "webhook_1",
        payload: payload(),
      }),
    ).rejects.toMatchObject({ nonRetryable: true });
    mocks.sendSlackAlert.mockRejectedValueOnce(
      new Error("Slack alert send failed: channel_not_found."),
    );
    await expect(
      deliverAlertSlackActivity({
        alertId: "alert_1",
        payload: payload(),
        slackConnectionId: "slack_1",
      }),
    ).rejects.toMatchObject({ nonRetryable: true });
  });

  it("a bare ApplicationFailure from an immediate send becomes non-retryable", async () => {
    mocks.sendSlackAlert.mockRejectedValue(
      ApplicationFailure.create({ message: "Slack delivery failed." }),
    );

    await expect(
      deliverAlertSlackActivity({
        alertId: "alert_1",
        payload: payload(),
        slackConnectionId: "slack_1",
      }),
    ).rejects.toMatchObject({ nonRetryable: true });
  });

  it("finalizes delivered alerts and emits the in-app notification", async () => {
    await expect(
      finalizeAlertDeliveryActivity({
        alertId: "alert_1",
        deliveryClaimToken: "claim_1",
        outcomes: [{ channel: "email", delivered: true }],
        payload: payload(),
        projectInternalId: "project_1",
      }),
    ).resolves.toEqual({ deliveryState: "delivered" });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: {
        deliveredAt: expect.any(Date),
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "delivered",
      },
      where: {
        deliveryClaimToken: "claim_1",
        deliveryState: "delivering",
        id: "alert_1",
      },
    });
    expect(mocks.notifyTriggeredAlertDelivered).toHaveBeenCalledWith({
      payload: payload(),
      projectInternalId: "project_1",
      triggeredAlertId: "alert_1",
    });
  });

  it("dead-letters and records missing-recipient failures", async () => {
    await expect(
      finalizeAlertDeliveryActivity({
        alertId: "alert_1",
        deliveryClaimToken: "claim_1",
        outcomes: [{ channel: "webhook", delivered: false, reason: "failed" }],
        payload: payload(),
        projectInternalId: "project_1",
      }),
    ).resolves.toEqual({ deliveryState: "dead_letter" });
    await expect(
      finalizeAlertDeliveryActivity({
        alertId: "alert_2",
        deliveryClaimToken: "claim_2",
        outcomes: [
          {
            channel: "email",
            delivered: false,
            reason: "Email delivery has no enabled recipients.",
            recordAttempt: true,
          },
        ],
        payload: { ...payload(), alertId: "alert_2" },
        projectInternalId: "project_1",
      }),
    ).resolves.toEqual({ deliveryState: "dead_letter" });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "email",
        error: "Email delivery has no enabled recipients.",
        status: "failed",
      }),
    });
  });
});
