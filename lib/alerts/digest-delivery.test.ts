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
import { deliverAlertDigestPushActivity } from "./digest-push";
import type { AlertDigestJob } from "./digest-types";
import { allAlertsDeliverable } from "./send-gate";
import { buildAlertDigestWebhookBody } from "./webhook-envelope";

const mocks = vi.hoisted(() => ({
  deliverPushToProject: vi.fn(),
  pushSender: vi.fn(),
  notifyTriggeredAlertsDelivered: vi.fn(),
  postSignedBody: vi.fn(),
  prisma: {
    alertDigestSend: { deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    deliveryAttempt: { create: vi.fn() },
    preparedEmailMessage: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    triggeredAlert: { findMany: vi.fn(), updateMany: vi.fn(), updateManyAndReturn: vi.fn() },
    webhookEndpoint: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
  sendEmail: vi.fn(),
  sendSlackMessage: vi.fn(),
  stampWebhookDelivery: vi.fn(),
}));

const activity = vi.hoisted(() => ({ attempt: 1 }));
vi.mock("@temporalio/activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@temporalio/activity")>()),
  Context: { current: () => ({ info: { attempt: activity.attempt } }) },
}));
vi.mock("./digest-legacy-admission", () => ({ legacyDigestAdmission: async () => null }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: mocks.sendEmail,
}));
vi.mock("@/lib/notifications/events", () => ({
  notifyTriggeredAlertsDelivered: mocks.notifyTriggeredAlertsDelivered,
}));
vi.mock("./send-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./send-gate")>()),
  allAlertsDeliverable: vi.fn().mockResolvedValue(true),
  alertEmailSendGate: vi.fn().mockResolvedValue({
    allowed: true,
    email: "owner@example.com",
    userId: "user_1",
    projectId: "project_1",
  }),
  requireAlertEmailSend: vi.fn(async () => ({
    allowed: true,
    email: "owner@example.com",
    projectId: "project_1",
    userId: "user_1",
  })),
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

vi.mock("@/lib/notifications/apns", () => ({ defaultPushSender: mocks.pushSender }));
vi.mock("./push-delivery", () => ({ deliverPushToProject: mocks.deliverPushToProject }));

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
    activity.attempt = 1;
    mocks.prisma.triggeredAlert.updateManyAndReturn.mockReset();
    vi.stubEnv("EMAIL_FROM", "bisibility <alerts@example.com>");
    vi.stubEnv("EMAIL_PROVIDER", "");
    mocks.notifyTriggeredAlertsDelivered.mockResolvedValue(undefined);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "webhook_1" }, { id: "webhook_2" }]);
    mocks.postSignedBody.mockResolvedValue(undefined);
    mocks.prisma.deliveryAttempt.create.mockResolvedValue({});
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      { id: "triggered_alert_1", publicId: publicId("al") },
      { id: "triggered_alert_2", publicId: publicId("al", "b") },
    ]);
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 2 });
    mocks.prisma.triggeredAlert.updateManyAndReturn.mockResolvedValue([
      { id: "triggered_alert_1", publicId: publicId("al") },
      { id: "triggered_alert_2", publicId: publicId("al", "b") },
    ]);
    mocks.prisma.webhookEndpoint.findUnique.mockResolvedValue({
      enabled: true,
      hmacSecret: "encrypted",
      id: "webhook_1",
      url: "https://example.com/hook",
    });
    const rows = new Map<string, Record<string, unknown>>();
    mocks.prisma.preparedEmailMessage.findUnique.mockImplementation(async ({ where }) => {
      const row = rows.get(where.deliveryIdentity);
      return row ? { ...row } : null;
    });
    mocks.prisma.preparedEmailMessage.create.mockImplementation(async ({ data }) => {
      const row = { id: "prepared_1", ...data };
      rows.set(data.deliveryIdentity, row);
      return row;
    });
    mocks.prisma.preparedEmailMessage.updateMany.mockImplementation(async ({ data, where }) => {
      const row = rows.get(where.deliveryIdentity);
      if (!row) return { count: 0 };
      if (where.state && row.state !== where.state) return { count: 0 };
      if (where.budgetReserved !== undefined && row.budgetReserved !== where.budgetReserved) {
        return { count: 0 };
      }
      Object.assign(row, data);
      return { count: 1 };
    });
    mocks.sendEmail.mockImplementation(
      async (input: { claimProviderSend?: () => Promise<void> }) => {
        await input.claimProviderSend?.();
      },
    );
    mocks.sendSlackMessage.mockResolvedValue(true);
    mocks.stampWebhookDelivery.mockResolvedValue(undefined);
  });

  it.each(["slack", "webhook"] as const)(
    "skips an ineligible first %s attempt without marking it unknown",
    async (channel) => {
      vi.mocked(allAlertsDeliverable).mockResolvedValue(false);
      try {
        const current = job();
        const result =
          channel === "slack"
            ? await deliverAlertDigestSlackActivity(current)
            : await deliverAlertDigestWebhookActivity({ endpointId: "webhook_1", job: current });
        expect(result).toMatchObject({ delivered: false, skipped: true });
        expect(result).not.toHaveProperty("unknown", true);
        expect(mocks.sendSlackMessage).not.toHaveBeenCalled();
        expect(mocks.postSignedBody).not.toHaveBeenCalled();
      } finally {
        vi.mocked(allAlertsDeliverable).mockResolvedValue(true);
      }
    },
  );

  it("sends one email without recording per-alert attempts", async () => {
    const digest = job();
    await expect(
      deliverAlertDigestEmailActivity({ job: digest, recipient: digest.recipients[0] }),
    ).resolves.toEqual({ delivered: true, skipped: false });
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "bulk",
        to: "owner@example.com",
        listUnsubscribeUrl: expect.stringContaining("stream=notification"),
        text: expect.stringContaining("Unsubscribe: https://"),
        html: expect.stringContaining(">Unsubscribe</a>"),
      }),
    );
    expect(mocks.prisma.deliveryAttempt.create).not.toHaveBeenCalled();
  });

  it("pairs raw claimed IDs with public payloads before rendering a partial digest", async () => {
    const digest = job();
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      { id: "triggered_alert_2", publicId: publicId("al", "b") },
    ]);

    await expect(prepareAlertDigestDeliveryActivity(digest)).resolves.toMatchObject({
      alertIds: ["triggered_alert_2"],
      alerts: [expect.objectContaining({ alertId: publicId("al", "b") })],
    });
    expect(mocks.prisma.triggeredAlert.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["triggered_alert_1"] } }),
      }),
    );
  });

  it("sends the surviving digest alerts and records the resolved alert as skipped", async () => {
    const digest = job();
    digest.alerts[0].keyword = "first";
    digest.alerts[1].keyword = "second";
    digest.alertIds.push("triggered_alert_3");
    digest.alerts.push({ ...digest.alerts[0], alertId: publicId("al", "c"), keyword: "third" });
    mocks.prisma.triggeredAlert.findMany
      .mockResolvedValueOnce([
        { id: "triggered_alert_1", publicId: publicId("al") },
        { id: "triggered_alert_2", publicId: publicId("al", "b") },
        { id: "triggered_alert_3", publicId: publicId("al", "c") },
      ])
      .mockResolvedValueOnce([
        { id: "triggered_alert_1", publicId: publicId("al") },
        { id: "triggered_alert_3", publicId: publicId("al", "c") },
      ]);
    mocks.prisma.triggeredAlert.updateManyAndReturn.mockResolvedValueOnce([
      { id: "triggered_alert_2", publicId: publicId("al", "b") },
    ]);
    const flushed = await prepareAlertDigestDeliveryActivity(digest);
    expect(flushed).not.toBeNull();
    const prepared = await prepareAlertDigestDeliveryActivity(flushed as AlertDigestJob);
    expect(prepared?.alertIds).toEqual(["triggered_alert_1", "triggered_alert_3"]);
    expect(prepared?.email.subject).toContain("2 alerts");
    expect(prepared?.email.text).toContain("first");
    expect(prepared?.email.text).toContain("third");
    expect(prepared?.email.text).not.toContain("second");
    expect(prepared?.slackText).not.toContain("second");
    expect(JSON.stringify(prepared?.webhookBody)).not.toContain("second");
    for (const channel of digest.channels) {
      expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeredAlertId: "triggered_alert_2",
          channel,
          status: "skipped",
          error: expect.any(String),
        }),
      });
    }
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(digest.channels.length);
    await deliverAlertDigestEmailActivity({
      job: prepared as AlertDigestJob,
      recipient: digest.recipients[0],
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.not.stringContaining("second") }),
    );
  });

  it("records an unknown digest email without returning it to the pending queue", async () => {
    const result = await finalizeAlertDigestDeliveryActivity({
      job: job(),
      outcomes: [
        {
          channel: "email",
          delivered: false,
          reason:
            "Confirm this message with the mail provider before any manual resend. Automatic retry is disabled.",
          skipped: false,
          unknown: true,
        },
      ],
    });
    expect(result).toEqual({ deliveryState: "dead_letter" });
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: "email", status: "unknown" }),
    });
    expect(mocks.prisma.triggeredAlert.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryState: "digest_pending" }),
      }),
    );
  });

  it("returns every alert to the pending digest if the stale alert is deliverable again", async () => {
    const digest = job();
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      { id: "triggered_alert_1", publicId: publicId("al") },
      { id: "triggered_alert_2", publicId: publicId("al", "b") },
    ]);
    const result = await finalizeAlertDigestDeliveryActivity({
      job: digest,
      outcomes: [
        {
          channel: "email",
          delivered: false,
          skipped: true,
          reason: "Alert is no longer deliverable.",
        },
      ],
    });
    expect(result).toEqual({ deliveryState: "digest_pending" });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryState: "digest_pending" }),
        where: expect.objectContaining({
          id: { in: ["triggered_alert_1", "triggered_alert_2"] },
        }),
      }),
    );
    expect(mocks.prisma.triggeredAlert.updateManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.prisma.deliveryAttempt.create).not.toHaveBeenCalled();
  });

  it("returns unaffected alerts to the pending digest if the frozen message becomes stale", async () => {
    const digest = job();
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      { id: "triggered_alert_1", publicId: publicId("al") },
    ]);
    mocks.prisma.triggeredAlert.updateManyAndReturn.mockResolvedValueOnce([
      { id: "triggered_alert_2" },
    ]);
    const result = await finalizeAlertDigestDeliveryActivity({
      job: digest,
      outcomes: [
        {
          channel: "email",
          delivered: false,
          skipped: true,
          reason: "Alert is no longer deliverable.",
        },
      ],
    });
    expect(result).toEqual({ deliveryState: "digest_pending" });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryState: "digest_pending" }),
        where: expect.objectContaining({ id: { in: ["triggered_alert_1"] } }),
      }),
    );
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        triggeredAlertId: "triggered_alert_2",
        status: "skipped",
        error: "Alert is no longer deliverable.",
      }),
    });
  });

  it("does not requeue a stale digest when another attempt has an unknown outcome", async () => {
    const digest = job();
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      { id: "triggered_alert_1", publicId: publicId("al") },
    ]);
    mocks.prisma.triggeredAlert.updateManyAndReturn.mockResolvedValueOnce([
      { id: "triggered_alert_2", publicId: publicId("al", "b") },
    ]);
    const result = await finalizeAlertDigestDeliveryActivity({
      job: digest,
      outcomes: [
        {
          channel: "email",
          delivered: false,
          skipped: true,
          reason: "Alert is no longer deliverable.",
        },
        { channel: "webhook", delivered: false, reason: "Acceptance unknown." },
      ],
    });
    expect(result).toEqual({ deliveryState: "dead_letter" });
    expect(mocks.prisma.triggeredAlert.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryState: "digest_pending" }),
      }),
    );
  });

  it.each(["slack", "webhook"] as const)(
    "finalizes a stale retried %s refusal as unknown, never failed",
    async (channel) => {
      activity.attempt = 3;
      vi.mocked(allAlertsDeliverable).mockResolvedValue(false);
      const digest = { ...job(), channels: [channel] };
      try {
        const result =
          channel === "slack"
            ? await deliverAlertDigestSlackActivity(digest)
            : await deliverAlertDigestWebhookActivity({ endpointId: "webhook_1", job: digest });
        await expect(
          finalizeAlertDigestDeliveryActivity({ job: digest, outcomes: [{ channel, ...result }] }),
        ).resolves.toEqual({ deliveryState: "dead_letter" });
        expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledExactlyOnceWith({
          data: expect.objectContaining({ channel, status: "unknown" }),
        });
        expect(mocks.prisma.triggeredAlert.updateManyAndReturn).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ deliverySummary: [{ channel, status: "unknown" }] }),
            where: expect.objectContaining({ id: { in: digest.alertIds } }),
          }),
        );
        expect(result).toMatchObject({ delivered: false, skipped: false, unknown: true });
      } finally {
        vi.mocked(allAlertsDeliverable).mockResolvedValue(true);
      }
      expect(mocks.sendSlackMessage).not.toHaveBeenCalled();
      expect(mocks.postSignedBody).not.toHaveBeenCalled();
      expect(mocks.prisma.triggeredAlert.updateMany).not.toHaveBeenCalled();
    },
  );

  it("does not requeue a stale digest when another refusal came from a retried attempt", async () => {
    const result = await finalizeAlertDigestDeliveryActivity({
      job: job(),
      outcomes: [
        {
          channel: "email",
          delivered: false,
          skipped: true,
          reason: "Alert is no longer deliverable.",
        },
        {
          channel: "webhook",
          delivered: false,
          retried: true,
          skipped: true,
          reason: "Webhook delivery is not configured.",
        },
      ],
    });
    expect(result).toEqual({ deliveryState: "skipped" });
    expect(mocks.prisma.triggeredAlert.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryState: "digest_pending" }),
      }),
    );
  });

  it("marks a non-stale refusal on a retried attempt so it is never requeued", async () => {
    activity.attempt = 2;
    const digest = { ...job(), slackConnection: { enabled: false, id: "slack_1" } };
    expect(await deliverAlertDigestSlackActivity(digest as AlertDigestJob)).toEqual({
      delivered: false,
      retried: true,
      skipped: true,
      reason: "Slack delivery is not configured.",
    });
  });

  it("records all ineligible digest alerts as skipped", async () => {
    const digest = job();
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([]);
    mocks.prisma.triggeredAlert.updateManyAndReturn.mockResolvedValue([
      { id: "triggered_alert_1", publicId: publicId("al") },
      { id: "triggered_alert_2", publicId: publicId("al", "b") },
    ]);
    expect(await prepareAlertDigestDeliveryActivity(digest)).toBeNull();
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(6);
  });

  it("checks the rule and project before preparing the digest", async () => {
    await prepareAlertDigestDeliveryActivity(job());
    expect(mocks.prisma.triggeredAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ruleId: "rule_1",
          rule: { enabled: true, projectId: "project_1" },
        }),
      }),
    );
  });

  it("matches shuffled digest payloads to their stable alert IDs", async () => {
    const digest = job();
    digest.alerts.reverse();
    const prepared = await prepareAlertDigestDeliveryActivity(digest);
    expect(prepared?.alerts.map((alert) => alert.alertId)).toEqual([
      publicId("al", "b"),
      publicId("al"),
    ]);
    expect(prepared?.alertIds).toEqual(["triggered_alert_2", "triggered_alert_1"]);
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
    ).resolves.toMatchObject({ delivered: false, skipped: true });
    expect(mocks.postSignedBody).not.toHaveBeenCalled();
    expect(mocks.stampWebhookDelivery).not.toHaveBeenCalled();
  });

  it("posts the alert.digest body after loading the endpoint secret by id", async () => {
    await expect(
      deliverAlertDigestWebhookActivity({ endpointId: "webhook_1", job: job() }),
    ).resolves.toEqual({ delivered: true, skipped: false });
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
    await expect(deliverAlertDigestSlackActivity(job())).resolves.toEqual({
      delivered: true,
      skipped: false,
    });
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

  it.each([
    { acceptedCount: 0, failedCount: 0, unknownCount: 0 },
    { acceptedCount: 1, failedCount: 0, unknownCount: 0 },
    { acceptedCount: 0, failedCount: 0, unknownCount: 1 },
  ])("preserves measured digest push outcomes: %j", async (counts) => {
    mocks.pushSender.mockReturnValue({});
    mocks.deliverPushToProject.mockResolvedValue({
      ...counts,
      devices: counts.acceptedCount + counts.failedCount + counts.unknownCount,
      failures: [],
      retryable: false,
      sent: counts.acceptedCount,
    });
    const outcome = await deliverAlertDigestPushActivity(job());
    expect(outcome).toEqual({
      delivered: counts.acceptedCount > 0,
      skipped: counts.acceptedCount + counts.failedCount + counts.unknownCount === 0,
      counts,
    });
  });

  it("finalizes successful jobs and emits notifications for every alert", async () => {
    await expect(
      finalizeAlertDigestDeliveryActivity({
        job: job(),
        outcomes: [{ channel: "email", delivered: true }],
      }),
    ).resolves.toEqual({ deliveryState: "digested" });
    expect(mocks.prisma.triggeredAlert.updateManyAndReturn).toHaveBeenCalledWith({
      select: { id: true, publicId: true },
      data: {
        deliveredAt: expect.any(Date),
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "digested",
        deliverySummary: [
          {
            channel: "email",
            counts: { acceptedCount: 1, failedCount: 0, unknownCount: 0 },
            status: "sent",
          },
          { channel: "slack", status: "skipped" },
          { channel: "webhook", status: "skipped" },
        ],
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
        acceptedCount: 1,
        failedCount: 0,
        unknownCount: 0,
        channel: "email",
        error: null,
        status: "sent",
        triggeredAlertId: "triggered_alert_1",
      },
    });
    expect(mocks.notifyTriggeredAlertsDelivered).toHaveBeenCalledTimes(1);
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

    expect(mocks.prisma.triggeredAlert.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliverySummary: [
            {
              channel: "email",
              counts: { acceptedCount: 1, failedCount: 1, unknownCount: 0 },
              status: "partial",
            },
            { channel: "slack", status: "skipped" },
            { channel: "webhook", status: "sent" },
            { channel: "webhook", status: "failed" },
          ],
        }),
      }),
    );
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(4);
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "email",
        status: "partial",
        acceptedCount: 1,
        failedCount: 1,
        unknownCount: 0,
      }),
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
    mocks.prisma.triggeredAlert.updateManyAndReturn
      .mockResolvedValueOnce([
        { id: "triggered_alert_1", publicId: publicId("al") },
        { id: "triggered_alert_2", publicId: publicId("al", "b") },
      ])
      .mockResolvedValueOnce([]);
    const input = { job: job(), outcomes: [{ channel: "email" as const, delivered: true }] };

    await finalizeAlertDigestDeliveryActivity(input);
    await finalizeAlertDigestDeliveryActivity(input);

    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(3);
    expect(mocks.notifyTriggeredAlertsDelivered).toHaveBeenCalledTimes(1);
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
    // The in-app notification does not depend on the external channel.
    expect(mocks.notifyTriggeredAlertsDelivered).toHaveBeenCalledTimes(1);
  });

  it("notifies in-app for digested rules without external channels", async () => {
    await expect(
      finalizeAlertDigestDeliveryActivity({ job: { ...job(), channels: [] }, outcomes: [] }),
    ).resolves.toEqual({ deliveryState: "skipped" });
    expect(mocks.notifyTriggeredAlertsDelivered).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, ""])("refuses finalization without owner token %s", async (token) => {
    const input = { ...job(), deliveryClaimToken: token } as unknown as AlertDigestJob;
    expect(
      await finalizeAlertDigestDeliveryActivity({
        job: input,
        outcomes: [{ channel: "email", delivered: true }],
      }),
    ).toEqual({ deliveryState: "skipped" });
    expect(mocks.prisma.triggeredAlert.updateManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.prisma.deliveryAttempt.create).not.toHaveBeenCalled();
    expect(mocks.notifyTriggeredAlertsDelivered).not.toHaveBeenCalled();
  });

  it("preparation without an owner cannot adopt another claim", async () => {
    const input = { ...job(), deliveryClaimToken: undefined } as unknown as AlertDigestJob;
    expect(await prepareAlertDigestDeliveryActivity(input)).toBeNull();
    expect(mocks.prisma.triggeredAlert.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.triggeredAlert.updateManyAndReturn).not.toHaveBeenCalled();
  });
});
