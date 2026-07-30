import { ApplicationFailure } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertDigestJob } from "../alerts/digest-types";
import { buildAlertDigestWebhookBody } from "../alerts/webhook-envelope";
import type { AlertDeliveryContext } from "./alert-delivery-activities";
import {
  alertDeliveryWorkflow,
  alertDigestDeliveryWorkflow,
  sweepAlertDeliveriesWorkflow,
} from "./alert-delivery-workflows";

const publicId = (prefix: string, first = "a") => `${prefix}_${first}${"0".repeat(23)}`;

const mocks = vi.hoisted(() => {
  const activities = {
    claimAlertDeliveryActivity: vi.fn(),
    deliverAlertDigestEmailActivity: vi.fn(),
    deliverAlertDigestSlackActivity: vi.fn(),
    deliverAlertDigestWebhookActivity: vi.fn(),
    deliverAlertEmailActivity: vi.fn(),
    deliverAlertSlackActivity: vi.fn(),
    deliverAlertWebhookActivity: vi.fn(),
    finalizeAlertDeliveryActivity: vi.fn(),
    finalizeAlertDigestDeliveryActivity: vi.fn(),
    loadAlertDeliveryContextActivity: vi.fn(),
    prepareAlertDigestDeliveryActivity: vi.fn(),
    reserveAlertDeliveryBudgetActivity: vi.fn(),
    sweepAlertDeliveriesActivity: vi.fn(),
  };
  return { activities, proxyActivities: vi.fn(() => activities), uuid4: vi.fn(() => "claim_1") };
});
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: mocks.proxyActivities,
  uuid4: mocks.uuid4,
}));

function context(overrides: Partial<AlertDeliveryContext> = {}): AlertDeliveryContext {
  return {
    channels: ["email", "webhook", "slack"],
    payload: {
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
    },
    recipients: [{ email: "owner@example.com", userId: "user_1" }],
    projectInternalId: "project_db_1",
    slackConnectionId: "slack_1",
    triggeredAlertId: "triggered_alert_db_1",
    webhookEndpointIds: ["webhook_1", "webhook_2"],
    ...overrides,
  };
}

describe("alertDeliveryWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activities.claimAlertDeliveryActivity.mockResolvedValue({ claimed: true });
    mocks.activities.loadAlertDeliveryContextActivity.mockResolvedValue(context());
    mocks.activities.reserveAlertDeliveryBudgetActivity.mockResolvedValue({ granted: true });
    mocks.activities.deliverAlertEmailActivity.mockResolvedValue(undefined);
    mocks.activities.deliverAlertWebhookActivity.mockResolvedValue(undefined);
    mocks.activities.deliverAlertSlackActivity.mockResolvedValue(undefined);
    mocks.activities.finalizeAlertDeliveryActivity.mockResolvedValue({
      deliveryState: "delivered",
    });
  });

  it("delivers every configured channel and finalizes delivered", async () => {
    await expect(alertDeliveryWorkflow({ alertId: "alert_1" })).resolves.toMatchObject({
      status: "delivered",
    });
    expect(mocks.activities.deliverAlertEmailActivity).toHaveBeenCalledOnce();
    expect(mocks.activities.deliverAlertWebhookActivity).toHaveBeenCalledTimes(2);
    expect(mocks.activities.deliverAlertSlackActivity).toHaveBeenCalledOnce();
    expect(mocks.activities.deliverAlertEmailActivity).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: "triggered_alert_db_1", payload: context().payload }),
    );
    expect(mocks.activities.deliverAlertWebhookActivity).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: "triggered_alert_db_1", payload: context().payload }),
    );
    expect(mocks.activities.deliverAlertSlackActivity).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: "triggered_alert_db_1", payload: context().payload }),
    );
    expect(mocks.activities.finalizeAlertDeliveryActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomes: [
          { channel: "email", delivered: true },
          { channel: "webhook", delivered: true },
          { channel: "webhook", delivered: true },
          { channel: "slack", delivered: true },
        ],
      }),
    );
  });

  it("sends one alert email per enabled recipient", async () => {
    mocks.activities.loadAlertDeliveryContextActivity.mockResolvedValue(
      context({
        channels: ["email"],
        recipients: [
          { email: "owner@example.com", userId: "user_1" },
          { email: "second@example.com", userId: "user_2" },
        ],
        webhookEndpointIds: [],
      }),
    );

    await alertDeliveryWorkflow({ alertId: "alert_1" });

    expect(mocks.activities.deliverAlertEmailActivity).toHaveBeenCalledTimes(2);
    expect(mocks.activities.deliverAlertEmailActivity).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ recipientEmail: "second@example.com" }),
    );
  });

  it("continues after a terminal channel failure when another succeeds", async () => {
    mocks.activities.deliverAlertEmailActivity.mockRejectedValue(new Error("permanent"));
    await alertDeliveryWorkflow({ alertId: "alert_1" });
    expect(mocks.activities.deliverAlertWebhookActivity).toHaveBeenCalledTimes(2);
    expect(mocks.activities.deliverAlertSlackActivity).toHaveBeenCalledOnce();
    expect(mocks.activities.finalizeAlertDeliveryActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomes: expect.arrayContaining([
          expect.objectContaining({ channel: "email", delivered: false }),
          { channel: "slack", delivered: true },
        ]),
      }),
    );
  });

  it("calls a disabled webhook endpoint once and preserves its failure reason", async () => {
    mocks.activities.loadAlertDeliveryContextActivity.mockResolvedValue(
      context({
        channels: ["webhook"],
        webhookEndpointIds: ["webhook_disabled"],
      }),
    );
    mocks.activities.deliverAlertWebhookActivity.mockRejectedValue(
      ApplicationFailure.create({
        message: "Webhook delivery is not configured.",
        nonRetryable: true,
      }),
    );
    mocks.activities.finalizeAlertDeliveryActivity.mockResolvedValue({
      deliveryState: "dead_letter",
    });

    await alertDeliveryWorkflow({ alertId: "alert_1" });

    expect(mocks.activities.deliverAlertWebhookActivity).toHaveBeenCalledOnce();
    expect(mocks.activities.deliverAlertWebhookActivity).toHaveBeenCalledWith(
      expect.objectContaining({ endpointId: "webhook_disabled" }),
    );
    expect(mocks.activities.finalizeAlertDeliveryActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomes: [
          {
            channel: "webhook",
            delivered: false,
            reason: "Webhook delivery is not configured.",
          },
        ],
      }),
    );
  });

  it("records a generic failure only when a project has no webhook endpoints", async () => {
    mocks.activities.loadAlertDeliveryContextActivity.mockResolvedValue(
      context({ channels: ["webhook"], webhookEndpointIds: [] }),
    );
    mocks.activities.finalizeAlertDeliveryActivity.mockResolvedValue({
      deliveryState: "dead_letter",
    });

    await alertDeliveryWorkflow({ alertId: "alert_1" });

    expect(mocks.activities.deliverAlertWebhookActivity).not.toHaveBeenCalled();
    expect(mocks.activities.finalizeAlertDeliveryActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomes: [
          {
            channel: "webhook",
            delivered: false,
            reason: "No webhook endpoints.",
            recordAttempt: true,
          },
        ],
      }),
    );
  });

  it("finalizes dead_letter when all channels exhaust", async () => {
    mocks.activities.loadAlertDeliveryContextActivity.mockResolvedValue(
      context({ channels: ["email"], webhookEndpointIds: [] }),
    );
    mocks.activities.deliverAlertEmailActivity.mockRejectedValue(new Error("exhausted"));
    mocks.activities.finalizeAlertDeliveryActivity.mockResolvedValue({
      deliveryState: "dead_letter",
    });
    await expect(alertDeliveryWorkflow({ alertId: "alert_1" })).resolves.toMatchObject({
      status: "dead_letter",
    });
  });

  it("dead-letters email delivery when no enabled recipient exists", async () => {
    mocks.activities.loadAlertDeliveryContextActivity.mockResolvedValue(
      context({ channels: ["email"], recipients: [], webhookEndpointIds: [] }),
    );
    mocks.activities.finalizeAlertDeliveryActivity.mockResolvedValue({
      deliveryState: "dead_letter",
    });

    await expect(alertDeliveryWorkflow({ alertId: "alert_1" })).resolves.toMatchObject({
      status: "dead_letter",
    });
    expect(mocks.activities.finalizeAlertDeliveryActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomes: [
          {
            channel: "email",
            delivered: false,
            reason: "Email delivery has no enabled recipients.",
            recordAttempt: true,
          },
        ],
      }),
    );
  });

  it("does not touch channels when the claim is not acquired", async () => {
    mocks.activities.claimAlertDeliveryActivity.mockResolvedValue({ claimed: false });
    await expect(alertDeliveryWorkflow({ alertId: "alert_1" })).resolves.toEqual({
      alertId: "alert_1",
      status: "skipped",
    });
    expect(mocks.activities.loadAlertDeliveryContextActivity).not.toHaveBeenCalled();
    expect(mocks.activities.deliverAlertEmailActivity).not.toHaveBeenCalled();
  });

  it("stops before channels when the daily budget is exhausted", async () => {
    mocks.activities.reserveAlertDeliveryBudgetActivity.mockResolvedValue({ granted: false });
    await expect(alertDeliveryWorkflow({ alertId: "alert_1" })).resolves.toEqual({
      alertId: "alert_1",
      status: "suppressed",
    });
    expect(mocks.activities.deliverAlertEmailActivity).not.toHaveBeenCalled();
  });

  it("returns early when the alert no longer exists", async () => {
    mocks.activities.loadAlertDeliveryContextActivity.mockResolvedValue(null);
    await expect(alertDeliveryWorkflow({ alertId: "alert_1" })).resolves.toEqual({
      alertId: "alert_1",
      status: "missing",
    });
    expect(mocks.activities.finalizeAlertDeliveryActivity).not.toHaveBeenCalled();
  });

  it("delegates sweep workflows to the sweep activity", async () => {
    mocks.activities.sweepAlertDeliveriesActivity.mockResolvedValue({ scanned: 2, started: 1 });
    await expect(sweepAlertDeliveriesWorkflow()).resolves.toEqual({ scanned: 2, started: 1 });
  });
});

describe("alertDigestDeliveryWorkflow", () => {
  const job: AlertDigestJob = {
    alertIds: ["triggered_alert_1", "triggered_alert_2"],
    alerts: [context().payload, { ...context().payload, alertId: publicId("al", "b") }],
    channels: ["email", "slack", "webhook"],
    conditionType: "exits_top_n",
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
        alert_count: 0,
        alerts: [],
        condition_type: "exits_top_n",
        project_domain: "example.com",
        project_id: publicId("prj"),
        rule_id: publicId("alr"),
        rule_name: "Drop",
        suppressed_today_count: 0,
      },
      "2026-07-21T20:00:00.000Z",
    ),
    webhookEndpointIds: ["webhook_1", "webhook_2"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activities.prepareAlertDigestDeliveryActivity.mockImplementation(async (input) => input);
    mocks.activities.deliverAlertDigestEmailActivity.mockResolvedValue(true);
    mocks.activities.deliverAlertDigestSlackActivity.mockResolvedValue(true);
    mocks.activities.deliverAlertDigestWebhookActivity.mockResolvedValue(true);
    mocks.activities.finalizeAlertDigestDeliveryActivity.mockResolvedValue({
      deliveryState: "digested",
    });
  });

  it("delivers one digest on every configured channel and finalizes it", async () => {
    await expect(alertDigestDeliveryWorkflow(job)).resolves.toMatchObject({ status: "digested" });
    expect(mocks.activities.deliverAlertDigestEmailActivity).toHaveBeenCalledOnce();
    expect(mocks.activities.deliverAlertDigestWebhookActivity).toHaveBeenCalledTimes(2);
    expect(mocks.activities.deliverAlertDigestSlackActivity).toHaveBeenCalledOnce();
    expect(mocks.activities.finalizeAlertDigestDeliveryActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomes: expect.arrayContaining([
          { channel: "email", delivered: true, skipped: false },
          { channel: "slack", delivered: true, skipped: false },
          {
            channel: "webhook",
            delivered: true,
            skipped: false,
            webhookEndpointId: "webhook_1",
          },
          {
            channel: "webhook",
            delivered: true,
            skipped: false,
            webhookEndpointId: "webhook_2",
          },
        ]),
      }),
    );
  });

  it("skips a disabled digest endpoint once and keeps its identity", async () => {
    const webhookOnlyJob: AlertDigestJob = {
      ...job,
      channels: ["webhook"],
      webhookEndpointIds: ["webhook_disabled"],
    };
    mocks.activities.deliverAlertDigestWebhookActivity.mockResolvedValue(false);

    await alertDigestDeliveryWorkflow(webhookOnlyJob);

    expect(mocks.activities.deliverAlertDigestWebhookActivity).toHaveBeenCalledOnce();
    expect(mocks.activities.deliverAlertDigestWebhookActivity).toHaveBeenCalledWith({
      endpointId: "webhook_disabled",
      job: webhookOnlyJob,
    });
    expect(mocks.activities.finalizeAlertDigestDeliveryActivity).toHaveBeenCalledWith({
      job: webhookOnlyJob,
      outcomes: [
        {
          channel: "webhook",
          delivered: false,
          skipped: true,
          webhookEndpointId: "webhook_disabled",
        },
      ],
    });
  });

  it("fans a scheduled digest out to every enabled recipient", async () => {
    await alertDigestDeliveryWorkflow({
      ...job,
      channels: ["email"],
      recipients: [
        { email: "owner@example.com", userId: "user_1" },
        { email: "second@example.com", userId: "user_2" },
      ],
    });

    expect(mocks.activities.deliverAlertDigestEmailActivity).toHaveBeenCalledTimes(2);
    expect(mocks.activities.deliverAlertDigestEmailActivity).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ recipient: { email: "second@example.com", userId: "user_2" } }),
    );
  });

  it("preserves a non-retryable email-budget message for the recorded outcome", async () => {
    const emailOnlyJob: AlertDigestJob = { ...job, channels: ["email"] };
    const cause = ApplicationFailure.create({
      message: "Daily bulk email budget is exhausted.",
      nonRetryable: true,
      type: "email_budget_exceeded",
    });
    mocks.activities.deliverAlertDigestEmailActivity.mockRejectedValue(
      Object.assign(new Error("Activity task failed"), { cause }),
    );

    await alertDigestDeliveryWorkflow(emailOnlyJob);

    expect(mocks.activities.finalizeAlertDigestDeliveryActivity).toHaveBeenCalledWith({
      job: emailOnlyJob,
      outcomes: [
        {
          channel: "email",
          delivered: false,
          reason: "Daily bulk email budget is exhausted.",
        },
      ],
    });
  });
});
