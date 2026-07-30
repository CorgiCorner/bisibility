import { EmailBudgetExceededError } from "@/lib/email/send";
import { ApplicationFailure } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryHttpError } from "./delivery";
import {
  deliverAlertDigestEmailActivity,
  deliverAlertDigestSlackActivity,
  deliverAlertDigestWebhookActivity,
  finalizeAlertDigestDeliveryActivity,
  prepareAlertDigestDeliveryActivity,
} from "./digest-delivery";
import type { AlertDigestJob } from "./digest-types";
import { buildAlertDigestWebhookBody } from "./webhook-envelope";

const mocks = vi.hoisted(() => ({
  notifyTriggeredAlertDelivered: vi.fn(),
  postSignedBody: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    deliveryAttempt: { create: vi.fn() },
    triggeredAlert: { findMany: vi.fn(), updateMany: vi.fn() },
    webhookEndpoint: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
  sendEmail: vi.fn(),
  sendSlackMessage: vi.fn(),
  stampWebhookDelivery: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: mocks.sendEmail,
}));
vi.mock("@/lib/notifications/events", () => ({
  notifyTriggeredAlertDelivered: mocks.notifyTriggeredAlertDelivered,
}));
vi.mock("./delivery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./delivery")>()),
  postSignedBody: mocks.postSignedBody,
  recordDeliveryAttempt: vi.fn((alertId, channel, status, error) =>
    mocks.prisma.deliveryAttempt.create({
      data: { channel, error, status, triggeredAlertId: alertId },
    }),
  ),
  sendSlackMessage: mocks.sendSlackMessage,
  stampWebhookDelivery: mocks.stampWebhookDelivery,
}));

const publicId = (prefix: string, first = "a") => `${prefix}_${first}${"0".repeat(23)}`;

function job(): AlertDigestJob {
  const alert = {
    action: "Review it.",
    afterPosition: 14,
    alertId: publicId("al"),
    beforePosition: 8,
    conditionType: "position_drop",
    firedAt: "2026-07-21T20:00:00.000Z",
    headline: "Ranking dropped",
    keyword: "rank tracker",
    keywordId: publicId("kw"),
    projectDomain: "example.com",
    projectId: publicId("prj"),
    ruleId: publicId("alr"),
    ruleName: "Drop",
  };
  const alerts = [alert, { ...alert, alertId: publicId("al", "b") }];
  return {
    alertIds: ["triggered_alert_1", "triggered_alert_2"],
    alerts,
    channels: ["email", "slack", "webhook"],
    conditionType: "position_drop",
    createdAt: "2026-07-21T20:00:00.000Z",
    deliveryClaimToken: "claim_1",
    email: { html: "<p>Digest</p>", subject: "Digest", text: "Digest" },
    projectDomain: "example.com",
    projectId: "project_1",
    projectName: "Example",
    recipients: [{ email: "owner@example.com", userId: "user_1" }],
    ruleId: "rule_1",
    ruleName: "Drop",
    slackConnection: { enabled: true, id: "slack_1" },
    slackText: "Digest",
    suppressedTodayCount: 0,
    webhookBody: buildAlertDigestWebhookBody(
      {
        alert_count: alerts.length,
        alerts,
        condition_type: "position_drop",
        project_domain: "example.com",
        project_id: publicId("prj"),
        rule_id: publicId("alr"),
        rule_name: "Drop",
        suppressed_today_count: 0,
      },
      "2026-07-21T20:00:00.000Z",
    ),
    webhookEndpointIds: ["webhook_1"],
  };
}

describe("queued alert digest delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_FROM", "Bisibility <alerts@example.com>");
    mocks.notifyTriggeredAlertDelivered.mockResolvedValue(undefined);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "webhook_1" }, { id: "webhook_2" }]);
    mocks.postSignedBody.mockResolvedValue(undefined);
    mocks.prisma.deliveryAttempt.create.mockResolvedValue({});
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      { id: "triggered_alert_1" },
      { id: "triggered_alert_2" },
    ]);
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 2 });
    mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue({
      enabled: true,
      hmacSecret: "encrypted",
      id: "webhook_1",
      url: "https://example.com/hook",
    });
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.sendSlackMessage.mockResolvedValue(true);
    mocks.stampWebhookDelivery.mockResolvedValue(undefined);
  });

  it("sends one email without recording per-alert attempts", async () => {
    const digest = job();
    await expect(
      deliverAlertDigestEmailActivity({ job: digest, recipient: digest.recipients[0] }),
    ).resolves.toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ category: "bulk", to: "owner@example.com" }),
    );
    expect(mocks.prisma.deliveryAttempt.create).not.toHaveBeenCalled();
  });

  it("pairs raw claimed IDs with public payloads before rendering a partial digest", async () => {
    const digest = job();
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([{ id: "triggered_alert_2" }]);

    await expect(prepareAlertDigestDeliveryActivity(digest)).resolves.toMatchObject({
      alertIds: ["triggered_alert_2"],
      alerts: [expect.objectContaining({ alertId: publicId("al", "b") })],
    });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["triggered_alert_1"] } }),
      }),
    );
  });

  it("makes global email-budget exhaustion non-retryable", async () => {
    mocks.sendEmail.mockRejectedValue(
      new EmailBudgetExceededError("bulk", 1_000, new Date("2026-07-23T00:00:00.000Z")),
    );

    await expect(
      deliverAlertDigestEmailActivity({ job: job(), recipient: job().recipients[0] }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("bulk email budget"),
      nonRetryable: true,
      type: "email_budget_exceeded",
    });
  });

  it("skips a disabled digest endpoint without posting", async () => {
    mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue({
      enabled: false,
      hmacSecret: "encrypted",
      id: "webhook_1",
      url: "https://example.com/hook",
    });

    await expect(
      deliverAlertDigestWebhookActivity({ endpointId: "webhook_1", job: job() }),
    ).resolves.toBe(false);
    expect(mocks.postSignedBody).not.toHaveBeenCalled();
    expect(mocks.stampWebhookDelivery).not.toHaveBeenCalled();
  });

  it("posts the alert.digest body after loading the endpoint secret by id", async () => {
    await expect(
      deliverAlertDigestWebhookActivity({ endpointId: "webhook_1", job: job() }),
    ).resolves.toBe(true);
    expect(mocks.postSignedBody).toHaveBeenCalledWith(
      expect.objectContaining({ id: "webhook_1" }),
      expect.objectContaining({ event: "alert.digest", schemaVersion: 3 }),
    );
    expect(mocks.stampWebhookDelivery).toHaveBeenCalledWith("webhook_1");
  });

  it("does not stamp a failed digest webhook delivery", async () => {
    const transportError = new Error("temporary failure");
    mocks.postSignedBody.mockRejectedValueOnce(transportError);

    await expect(
      deliverAlertDigestWebhookActivity({ endpointId: "webhook_1", job: job() }),
    ).rejects.toBe(transportError);
    expect(mocks.stampWebhookDelivery).not.toHaveBeenCalled();
  });

  it("sends one Slack digest", async () => {
    await expect(deliverAlertDigestSlackActivity(job())).resolves.toBe(true);
    expect(mocks.sendSlackMessage).toHaveBeenCalledOnce();
  });

  it.each([
    ["webhook", 30],
    ["slack", 45],
  ] as const)(
    "maps digest %s HTTP 429 failures to provider-directed retries",
    async (channel, delay) => {
      const transportError = new DeliveryHttpError(`${channel} rate limited`, 429, delay);
      if (channel === "webhook") {
        mocks.postSignedBody.mockRejectedValueOnce(transportError);
      } else {
        mocks.sendSlackMessage.mockRejectedValueOnce(transportError);
      }

      const error = await (channel === "webhook"
        ? deliverAlertDigestWebhookActivity({ endpointId: "webhook_1", job: job() })
        : deliverAlertDigestSlackActivity(job())
      ).catch((caught) => caught);

      expect(error).toBeInstanceOf(ApplicationFailure);
      expect(error).toMatchObject({ nonRetryable: false, type: "rate_limited" });
      expect(String(error.nextRetryDelay)).toContain(String(delay));
      expect(mocks.stampWebhookDelivery).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["webhook", 422, true],
    ["slack", 422, true],
    ["webhook", 503, false],
    ["slack", 503, false],
  ] as const)(
    "keeps digest %s status %s classification unchanged",
    async (channel, status, nonRetryable) => {
      const transportError = new DeliveryHttpError(`${channel} status ${status}`, status, null);
      if (channel === "webhook") {
        mocks.postSignedBody.mockRejectedValueOnce(transportError);
      } else {
        mocks.sendSlackMessage.mockRejectedValueOnce(transportError);
      }

      const delivery =
        channel === "webhook"
          ? deliverAlertDigestWebhookActivity({ endpointId: "webhook_1", job: job() })
          : deliverAlertDigestSlackActivity(job());

      if (nonRetryable) {
        await expect(delivery).rejects.toMatchObject({ nonRetryable: true });
      } else {
        await expect(delivery).rejects.toBe(transportError);
      }
      expect(mocks.stampWebhookDelivery).not.toHaveBeenCalled();
    },
  );

  it("a non-retryable ApplicationFailure from a digest send is not retried", async () => {
    mocks.sendSlackMessage.mockRejectedValue(
      ApplicationFailure.create({
        message: "Slack delivery is permanently disabled.",
        nonRetryable: true,
        type: "permanent_delivery_failure",
      }),
    );

    await expect(deliverAlertDigestSlackActivity(job())).rejects.toMatchObject({
      nonRetryable: true,
      type: "permanent_delivery_failure",
    });
  });

  it("a bare ApplicationFailure from a digest send becomes non-retryable", async () => {
    mocks.sendSlackMessage.mockRejectedValue(
      ApplicationFailure.create({ message: "Slack delivery failed." }),
    );

    await expect(deliverAlertDigestSlackActivity(job())).rejects.toMatchObject({
      nonRetryable: true,
    });
  });

  it("finalizes successful jobs and emits notifications for every alert", async () => {
    await expect(
      finalizeAlertDigestDeliveryActivity({
        job: job(),
        outcomes: [{ channel: "email", delivered: true }],
      }),
    ).resolves.toEqual({ deliveryState: "digested" });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: {
        deliveredAt: expect.any(Date),
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "digested",
      },
      where: {
        deliveryClaimToken: "claim_1",
        deliveryState: "digesting",
        id: { in: ["triggered_alert_1", "triggered_alert_2"] },
      },
    });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: {
        channel: "email",
        error: null,
        status: "sent",
        triggeredAlertId: "triggered_alert_1",
      },
    });
    expect(mocks.notifyTriggeredAlertDelivered).toHaveBeenCalledTimes(2);
  });

  it("records digest webhook attempts separately for each endpoint", async () => {
    await finalizeAlertDigestDeliveryActivity({
      job: job(),
      outcomes: [
        { channel: "email", delivered: true },
        { channel: "email", delivered: false, reason: "recipient failed" },
        { channel: "slack", delivered: false, skipped: true },
        { channel: "webhook", delivered: true, webhookEndpointId: "webhook_1" },
        {
          channel: "webhook",
          delivered: false,
          reason: "rate limited",
          webhookEndpointId: "webhook_2",
        },
      ],
    });

    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(4);
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: "email", status: "sent" }),
    });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: "slack", status: "skipped" }),
    });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "webhook",
        status: "sent",
        webhookEndpointId: "webhook_1",
      }),
    });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "webhook",
        error: "rate limited",
        status: "failed",
        webhookEndpointId: "webhook_2",
      }),
    });
  });

  it("records a digest attempt without identity when the endpoint was deleted", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "webhook_1" }]);

    await finalizeAlertDigestDeliveryActivity({
      job: job(),
      outcomes: [
        {
          channel: "webhook",
          delivered: true,
          webhookEndpointId: "webhook_deleted",
        },
      ],
    });

    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "webhook",
        status: "sent",
      }),
    });
    expect(mocks.prisma.deliveryAttempt.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ webhookEndpointId: "webhook_deleted" }),
    });
  });

  it("does not duplicate attempts when finalization is retried", async () => {
    mocks.prisma.triggeredAlert.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 0 });
    const input = { job: job(), outcomes: [{ channel: "email" as const, delivered: true }] };

    await finalizeAlertDigestDeliveryActivity(input);
    await finalizeAlertDigestDeliveryActivity(input);

    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(3);
    expect(mocks.notifyTriggeredAlertDelivered).toHaveBeenCalledTimes(2);
  });

  it("dead-letters jobs when configured channels exhaust retries", async () => {
    await expect(
      finalizeAlertDigestDeliveryActivity({
        job: job(),
        outcomes: [{ channel: "email", delivered: false, reason: "failed" }],
      }),
    ).resolves.toEqual({ deliveryState: "dead_letter" });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "email",
        error: "failed",
        status: "failed",
      }),
    });
  });
});
