import { encryptSecret } from "@/lib/providers/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushAlertDigests, type PendingAlertDigestRecord } from "./digest";

const mocks = vi.hoisted(() => ({
  enqueueAlertDigestJob: vi.fn(),
  notifyTriggeredAlertDelivered: vi.fn(),
  recordSuppressed: vi.fn(),
  reserveDeliveryBudgetOnce: vi.fn(),
  sendEmail: vi.fn(),
  prisma: {
    alertRuleDailyStat: { findUnique: vi.fn() },
    deliveryAttempt: { create: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    slackConnection: { findUnique: vi.fn() },
    triggeredAlert: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/notifications/events", () => ({
  notifyTriggeredAlertDelivered: mocks.notifyTriggeredAlertDelivered,
}));
vi.mock("@/lib/temporal/alert-delivery-client", () => ({
  enqueueAlertDigestJob: mocks.enqueueAlertDigestJob,
}));
vi.mock("./daily-cap", () => ({
  recordSuppressed: mocks.recordSuppressed,
  reserveDeliveryBudgetOnce: mocks.reserveDeliveryBudgetOnce,
  utcDay: (now: Date) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
}));

const publicId = (prefix: string) => `${prefix}_a${"0".repeat(23)}`;

function pendingAlerts(
  count: number,
  options: {
    channels?: ("email" | "slack" | "webhook")[];
    endpoints?: number;
    ruleId?: string;
  } = {},
) {
  const ruleId = options.ruleId ?? "rule_1";
  return Array.from({ length: count }, (_, index) => ({
    afterPosition: index + 11,
    beforePosition: index + 1,
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    deliveredAt: null,
    deliveryState: "digest_pending",
    firedAt: new Date(new Date("2026-07-21T10:00:00.000Z").getTime() + index * 1_000),
    id: `alert_${index + 1}`,
    publicId: publicId("al"),
    keyword: { publicId: publicId("kw"), text: `keyword-${index + 1}` },
    keywordId: `keyword_${index + 1}`,
    payload: { action: "Review it", headline: `Alert ${index + 1}` },
    rankCheckId: `check_${index + 1}`,
    resolvedAt: null,
    rule: {
      channels: options.channels ?? ["email"],
      conditionType: "position_drop",
      createdBy: { email: "owner@example.com", id: "user_1" },
      id: ruleId,
      name: "Ranking drops",
      publicId: publicId("alr"),
      recipients: [{ user: { email: "second@example.com", id: "user_2" } }],
      project: {
        domain: "example.com",
        id: "project_1",
        name: "Example",
        publicId: publicId("prj"),
        slackConnection: { enabled: true, id: "slack_1" },
        webhookEndpoints: Array.from({ length: options.endpoints ?? 0 }, (_, endpointIndex) => ({
          hmacSecret: encryptSecret(`secret-${endpointIndex}`),
          id: `webhook_${endpointIndex + 1}`,
          url: `https://93.184.216.${34 + endpointIndex}/hook`,
        })),
      },
    },
    ruleId,
    snoozedUntil: null,
    status: "firing",
    updatedAt: new Date("2026-07-21T10:00:00.000Z"),
  })) as unknown as PendingAlertDigestRecord[];
}

describe("alert digest flush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv("EMAIL_FROM", "Bisibility <alerts@example.com>");
    mocks.reserveDeliveryBudgetOnce.mockResolvedValue({ granted: true, reused: false });
    mocks.recordSuppressed.mockResolvedValue({ overflowNoticeDue: false });
    mocks.prisma.alertRuleDailyStat.findUnique.mockResolvedValue({ suppressedCount: 0 });
    mocks.prisma.deliveryAttempt.create.mockResolvedValue({});
    mocks.prisma.notificationPreference.findMany.mockResolvedValue([]);
    mocks.prisma.triggeredAlert.updateMany.mockImplementation((input) =>
      Promise.resolve({ count: input?.where?.id?.in?.length ?? 0 }),
    );
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.notifyTriggeredAlertDelivered.mockResolvedValue(undefined);
    mocks.enqueueAlertDigestJob.mockResolvedValue(undefined);
  });

  it("coalesces pending alerts into one email per rule", async () => {
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue(pendingAlerts(3));

    await expect(flushAlertDigests(new Date("2026-07-21T11:00:00.000Z"))).resolves.toEqual({
      alertsQueued: 3,
      alertsSuppressed: 0,
      digestsQueued: 1,
      groupsFailed: 0,
    });

    expect(mocks.enqueueAlertDigestJob).toHaveBeenCalledOnce();
    expect(mocks.enqueueAlertDigestJob).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.objectContaining({
          subject: expect.stringContaining("3 alerts"),
          text: expect.stringMatching(/keyword-1[\s\S]*keyword-2[\s\S]*keyword-3/),
        }),
        recipients: [{ email: "second@example.com", userId: "user_2" }],
      }),
    );
    expect(mocks.prisma.notificationPreference.findMany).toHaveBeenCalledOnce();
    const job = mocks.enqueueAlertDigestJob.mock.calls[0]?.[0];
    expect(mocks.reserveDeliveryBudgetOnce).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryClaimToken: job.deliveryClaimToken }),
    );
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: {
        deliveryClaimedAt: expect.any(Date),
        deliveryClaimToken: expect.any(String),
        deliveryState: "digesting",
      },
      where: {
        deliveryState: "digest_pending",
        id: { in: ["alert_1", "alert_2", "alert_3"] },
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
        status: { not: "resolved" },
      },
    });
  });

  it("flush skips muted and resolved alerts", async () => {
    const now = new Date("2026-07-21T11:00:00.000Z");
    const alerts = pendingAlerts(3);
    alerts[0].snoozedUntil = new Date("2026-07-21T12:00:00.000Z");
    alerts[1].status = "resolved";
    mocks.prisma.triggeredAlert.findMany.mockImplementation((input) => {
      const lifecycleAware = JSON.stringify(input.where).includes("snoozedUntil");
      return Promise.resolve(lifecycleAware ? [alerts[2]] : alerts);
    });

    await flushAlertDigests(now);

    expect(mocks.enqueueAlertDigestJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertIds: ["alert_3"] }),
    );
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deliveryState: "skipped" } }),
    );
    expect(mocks.prisma.deliveryAttempt.create).not.toHaveBeenCalled();
  });

  it("queues one digest with every webhook endpoint id", async () => {
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue(
      pendingAlerts(5, { channels: ["webhook"], endpoints: 2 }),
    );

    await flushAlertDigests(new Date("2026-07-21T11:00:00.000Z"));

    expect(mocks.enqueueAlertDigestJob).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookBody: expect.objectContaining({
          data: expect.objectContaining({ alerts: expect.arrayContaining([]) }),
          event: "alert.digest",
        }),
        webhookEndpointIds: ["webhook_1", "webhook_2"],
      }),
    );
    const job = mocks.enqueueAlertDigestJob.mock.calls[0]?.[0];
    expect(job.webhookBody.data.alerts).toHaveLength(5);
  });

  it("digest carries all pending alerts and suppresses nothing while budget remains", async () => {
    mocks.prisma.slackConnection.findUnique.mockResolvedValue({
      accessTokenHash: encryptSecret("xoxb-test"),
      channelId: "C123",
      enabled: true,
    });
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue(
      pendingAlerts(25, { channels: ["email", "slack"] }),
    );

    await expect(flushAlertDigests(new Date("2026-07-21T11:00:00.000Z"))).resolves.toEqual({
      alertsQueued: 25,
      alertsSuppressed: 0,
      digestsQueued: 1,
      groupsFailed: 0,
    });

    expect(mocks.enqueueAlertDigestJob).toHaveBeenCalledOnce();
    const job = mocks.enqueueAlertDigestJob.mock.calls[0]?.[0];
    const emailText = job.email.text as string;
    const slackText = job.slackText as string;
    expect(emailText.match(/^keyword-/gm) ?? []).toHaveLength(20);
    expect(slackText.match(/^keyword-/gm) ?? []).toHaveLength(20);
    expect(emailText).toContain("+5 more");
    expect(slackText).toContain("+5 more");
    expect(emailText).not.toContain("daily cap");
    expect(job.alertIds).toHaveLength(25);
    expect(mocks.reserveDeliveryBudgetOnce).toHaveBeenCalledOnce();
    expect(mocks.recordSuppressed).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("overflow beyond the job bound is deferred, not suppressed", async () => {
    const alerts = pendingAlerts(250);
    mocks.prisma.triggeredAlert.findMany.mockImplementation(() =>
      Promise.resolve(alerts.filter((alert) => alert.deliveryState === "digest_pending")),
    );
    mocks.prisma.triggeredAlert.updateMany.mockImplementation((input) => {
      const ids = input?.where?.id?.in as string[] | undefined;
      if (!ids) return Promise.resolve({ count: 0 });
      for (const alert of alerts) {
        if (ids.includes(alert.id)) alert.deliveryState = input.data.deliveryState;
      }
      return Promise.resolve({ count: ids.length });
    });

    await expect(flushAlertDigests(new Date("2026-07-21T11:00:00.000Z"))).resolves.toEqual({
      alertsQueued: 200,
      alertsSuppressed: 0,
      digestsQueued: 1,
      groupsFailed: 0,
    });

    const job = mocks.enqueueAlertDigestJob.mock.calls[0]?.[0];
    expect(job.alertIds).toHaveLength(200);
    expect(alerts.slice(200).every((alert) => alert.deliveryState === "digest_pending")).toBe(true);
    expect(mocks.recordSuppressed).not.toHaveBeenCalled();
  });

  it("restores digest-pending state when queue handoff fails", async () => {
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue(pendingAlerts(3));
    mocks.enqueueAlertDigestJob.mockRejectedValue(new Error("Temporal unavailable"));

    await expect(flushAlertDigests()).resolves.toMatchObject({ groupsFailed: 1 });

    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenLastCalledWith({
      data: {
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "digest_pending",
      },
      where: {
        deliveryClaimToken: expect.any(String),
        deliveryState: "digesting",
        id: { in: ["alert_1", "alert_2", "alert_3"] },
      },
    });
  });

  it("suppresses over-cap groups without sending overflow email", async () => {
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue(pendingAlerts(3));
    mocks.reserveDeliveryBudgetOnce.mockResolvedValue({ granted: false, reused: false });
    mocks.recordSuppressed
      .mockResolvedValueOnce({ overflowNoticeDue: true })
      .mockResolvedValueOnce({ overflowNoticeDue: false });

    await expect(flushAlertDigests()).resolves.toMatchObject({ alertsSuppressed: 3 });
    await expect(flushAlertDigests()).resolves.toMatchObject({ alertsSuppressed: 3 });

    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: {
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "suppressed",
      },
      where: {
        deliveryClaimToken: expect.any(String),
        deliveryState: "digesting",
        id: { in: ["alert_1", "alert_2", "alert_3"] },
      },
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.prisma.deliveryAttempt.create).not.toHaveBeenCalled();
  });
});
