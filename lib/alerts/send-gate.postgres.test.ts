import { randomUUID } from "node:crypto";
import {
  deliverAlertDigestEmailActivity,
  deliverAlertDigestSlackActivity,
  deliverAlertDigestWebhookActivity,
  finalizeAlertDigestDeliveryActivity,
  prepareAlertDigestDeliveryActivity,
} from "@/lib/alerts/digest-delivery";
import { deliverAlertDigestPushActivity } from "@/lib/alerts/digest-push";
import { listTriggeredAlertFeedViews } from "@/lib/api/alert-list";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import {
  notifyTriggeredAlertDelivered,
  notifyTriggeredAlertsDelivered,
} from "@/lib/notifications/events";
import {
  deliverAlertEmailActivity,
  deliverAlertPushActivity,
  deliverAlertSlackActivity,
  deliverAlertWebhookActivity,
  finalizeAlertDeliveryActivity,
} from "@/lib/temporal/alert-delivery-channels";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { collectAlertDeliveryHealth, getAlertHealthConfig } from "./health";
import {
  alertEmailIdentity,
  digestEmailCanonicalEncoding,
  digestEmailIdentity,
} from "./prepared-email-delivery";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
const send = vi.hoisted(() => vi.fn());
const pushToProject = vi.hoisted(() => vi.fn());
const activity = vi.hoisted(() => ({ attempt: 1 }));
vi.mock("@temporalio/activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@temporalio/activity")>()),
  Context: { current: () => ({ info: { attempt: activity.attempt } }) },
}));
vi.mock("@/lib/alerts/push-delivery", () => ({ deliverPushToProject: pushToProject }));
vi.mock("@/lib/notifications/apns", () => ({
  defaultPushSender: () => ({ send: vi.fn(), topic: "com.example.app" }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: send }));
vi.mock("@/lib/email/from", () => ({ alertsEmailFrom: () => "alerts@example.com" }));
vi.mock("@/lib/email/notification-unsubscribe", () => ({
  notificationUnsubscribeUrl: () => "https://example.com/unsubscribe",
  notificationUnsubscribeFooter: (content: unknown) => content,
}));
vi.mock("@/lib/alerts/webhook-guard", () => ({
  resolveAllowedWebhookAddresses: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/notifications/events", () => ({
  notifyTriggeredAlertDelivered: vi.fn().mockResolvedValue(undefined),
  notifyTriggeredAlertsDelivered: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: vi.fn() }));
vi.mock("@/lib/seo/origin", () => ({ resolveCanonicalOrigin: () => "https://example.com" }));

let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>> | undefined;
let ownerId = "";
let memberId = "";
let projectId = "";
let ruleId = "";
let alertId = "";
let locationId = "";
const payload = { projectId: "prj_test", headline: "Rank changed", action: "Review it" } as never;

beforeAll(async () => {
  fixture = await closeoutPostgresFixture({ schemaOnly: true });
  shared.db = fixture.db;
  const suffix = randomUUID();
  const owner = await shared.db.user.create({
    data: { publicId: makePublicId("usr"), email: `${suffix}-owner@example.com`, name: "Owner" },
  });
  const member = await shared.db.user.create({
    data: { publicId: makePublicId("usr"), email: `${suffix}-member@example.org`, name: "Member" },
  });
  ownerId = owner.id;
  memberId = member.id;
  const project = await shared.db.project.create({
    data: { publicId: makePublicId("prj"), ownerId, name: "Fixture", domain: "example.com" },
  });
  projectId = project.id;
  await shared.db.membership.create({
    data: { publicId: makePublicId("mbr"), projectId, userId: memberId },
  });
  const location = await shared.db.location.create({
    data: {
      canonicalKey: suffix,
      kind: "country",
      displayName: "United States",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    },
  });
  locationId = location.id;
  const keyword = await shared.db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId,
      text: "fixture",
      location: "United States",
      locationId,
    },
  });
  const rule = await shared.db.alertRule.create({
    data: {
      publicId: makePublicId("alr"),
      projectId,
      name: "Fixture",
      conditionType: "position_drop",
      severity: "warning",
      channels: ["email"],
    },
  });
  ruleId = rule.id;
  const alert = await shared.db.triggeredAlert.create({
    data: { publicId: makePublicId("al"), ruleId, keywordId: keyword.id },
  });
  alertId = alert.id;
}, 60_000);
beforeEach(() => {
  send.mockReset();
  send.mockImplementation(async (input: { claimProviderSend?: () => Promise<void> }) => {
    await input.claimProviderSend?.();
  });
  activity.attempt = 1;
  pushToProject.mockReset();
  pushToProject.mockResolvedValue({
    acceptedCount: 1,
    failedCount: 0,
    unknownCount: 0,
    devices: 1,
    failures: [],
    retryable: false,
    sent: 1,
  });
  vi.mocked(notifyTriggeredAlertDelivered).mockClear();
});
afterAll(async () => {
  if (!fixture) return;
  if (projectId) await shared.db.project.deleteMany({ where: { id: projectId } });
  await shared.db.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  if (locationId) await shared.db.location.deleteMany({ where: { id: locationId } });
  await shared.db.$disconnect();
  await fixture.close();
});
function attempt(userId = memberId) {
  return deliverAlertEmailActivity({
    alertId,
    projectInternalId: projectId,
    ruleId,
    recipientUserId: userId,
    recipientEmail: "stale@example.com",
    payload,
  });
}
it("uses the current address and sends once for a current member", async () => {
  expect(await attempt()).toMatchObject({ delivered: true });
  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ to: expect.stringMatching(/@example\.org$/) }),
  );
});
it("gates an email activity scheduled before stable ids existed", async () => {
  const member = await shared.db.user.findUniqueOrThrow({ where: { id: memberId } });
  await shared.db.preparedEmailMessage.deleteMany({
    where: { deliveryIdentity: alertEmailIdentity(alertId, memberId) },
  });
  const legacy = { alertId, recipientEmail: member.email, payload };
  expect(await deliverAlertEmailActivity(legacy)).toMatchObject({ delivered: true });
  expect(
    await deliverAlertEmailActivity({
      ...legacy,
      projectInternalId: projectId,
      recipientUserId: memberId,
    }),
  ).toMatchObject({ delivered: true });
  // Both shapes are one logical delivery, so the id-bearing retry reuses the accepted message.
  expect(send).toHaveBeenCalledTimes(1);
  await shared.db.notificationPreference.create({
    data: { projectId, userId: memberId, alertEmail: false },
  });
  try {
    expect(await deliverAlertEmailActivity(legacy)).toMatchObject({
      delivered: false,
      skipped: true,
      reason: "Alert email consent is disabled.",
    });
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    await shared.db.notificationPreference.deleteMany({ where: { projectId, userId: memberId } });
  }
});
it("sends once when acceptance is logged after the attempt insert fails", async () => {
  const source = await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: alertId } });
  const row = await shared.db.triggeredAlert.create({
    data: { publicId: makePublicId("al"), ruleId, keywordId: source.keywordId },
  });
  await shared.db.$executeRawUnsafe("DROP SEQUENCE IF EXISTS al4b_fail_delivery_log");
  await shared.db.$executeRawUnsafe("CREATE SEQUENCE al4b_fail_delivery_log");
  await shared.db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION al4b_fail_delivery_log_fn() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      IF nextval('al4b_fail_delivery_log') = 1 THEN
        RAISE EXCEPTION 'attempt log failed';
      END IF;
      RETURN NEW;
    END;
    $fn$
  `);
  await shared.db.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS al4b_fail_delivery_log ON delivery_attempts",
  );
  await shared.db.$executeRawUnsafe(`
    CREATE TRIGGER al4b_fail_delivery_log
    BEFORE INSERT ON delivery_attempts
    FOR EACH ROW EXECUTE FUNCTION al4b_fail_delivery_log_fn()
  `);
  const input = {
    alertId: row.id,
    payload,
    projectInternalId: projectId,
    recipientEmail: "stale@example.com",
    recipientUserId: ownerId,
    ruleId,
  };
  try {
    await expect(deliverAlertEmailActivity(input)).rejects.toThrow(/attempt log failed/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await deliverAlertEmailActivity(input)).toMatchObject({
      delivered: true,
      skipped: false,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await shared.db.deliveryAttempt.count({
        where: { status: "sent", triggeredAlertId: row.id },
      }),
    ).toBe(1);
  } finally {
    await shared.db.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS al4b_fail_delivery_log ON delivery_attempts",
    );
    await shared.db.$executeRawUnsafe("DROP FUNCTION IF EXISTS al4b_fail_delivery_log_fn()");
    await shared.db.$executeRawUnsafe("DROP SEQUENCE IF EXISTS al4b_fail_delivery_log");
    await shared.db.preparedEmailMessage.deleteMany({
      where: { deliveryIdentity: alertEmailIdentity(row.id, ownerId) },
    });
    await shared.db.triggeredAlert.deleteMany({ where: { id: row.id } });
  }
});
async function digestFixture() {
  const source = await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: alertId } });
  const project = await shared.db.project.findUniqueOrThrow({ where: { id: projectId } });
  const rule = await shared.db.alertRule.findUniqueOrThrow({ where: { id: ruleId } });
  const records = await Promise.all(
    ["first", "second", "third"].map(async (keyword) => {
      const row = await shared.db.triggeredAlert.create({
        data: {
          publicId: makePublicId("al"),
          ruleId,
          keywordId: source.keywordId,
          deliveryState: "digesting",
          digestSubmissionStarted: false,
          deliveryClaimToken: "digest-test-claim",
        },
      });
      return {
        row,
        alert: {
          action: "Review",
          afterPosition: 3,
          alertId: row.publicId,
          beforePosition: 2,
          conditionType: "position_drop",
          firedAt: new Date().toISOString(),
          headline: "Changed",
          keyword,
          keywordId: makePublicId("kw"),
          projectDomain: "example.com",
          projectId: project.publicId,
          ruleId: rule.publicId,
          ruleName: "Fixture",
        },
      };
    }),
  );
  return {
    records,
    job: {
      alertIds: records.map(({ row }) => row.id),
      alerts: records.map(({ alert }) => alert),
      channels: ["email"],
      conditionType: "position_drop",
      createdAt: new Date().toISOString(),
      deliveryClaimToken: "digest-test-claim",
      email: { subject: "old", html: "old", text: "old" },
      projectDomain: "example.com",
      projectId,
      projectName: "Fixture",
      recipients: [{ userId: ownerId, email: "stale@example.com" }],
      ruleId,
      ruleName: "Fixture",
      slackText: "old",
      suppressedTodayCount: 0,
      webhookBody: {} as never,
      webhookEndpointIds: [],
    } as const,
  };
}
it("delivers only current digest alerts when one resolves after flush", async () => {
  const { records, job } = await digestFixture();
  const flushed = await prepareAlertDigestDeliveryActivity(job as never);
  expect(flushed?.alerts).toHaveLength(3);
  await shared.db.triggeredAlert.update({
    where: { id: records[1].row.id },
    data: { status: "resolved" },
  });
  const prepared = await prepareAlertDigestDeliveryActivity(flushed as never);
  expect(prepared?.alertIds).toEqual([records[0].row.id, records[2].row.id]);
  expect(prepared?.email.subject).toContain("2 alerts");
  expect(prepared?.email.text).toContain("first");
  expect(prepared?.email.text).toContain("third");
  expect(prepared?.email.text).not.toContain("second");
  expect(prepared?.slackText).not.toContain("second");
  expect(JSON.stringify(prepared?.webhookBody)).not.toContain("second");
  expect(
    await shared.db.deliveryAttempt.findFirst({ where: { triggeredAlertId: records[1].row.id } }),
  ).toMatchObject({ status: "skipped", error: "Alert is no longer deliverable." });
  const result = await deliverAlertDigestEmailActivity({
    job: prepared as never,
    recipient: job.recipients[0],
  });
  expect(result.delivered).toBe(true);
  expect(send).toHaveBeenCalledOnce();
  await finalizeAlertDigestDeliveryActivity({
    job: prepared as never,
    outcomes: [{ channel: "email", ...result }],
  });
  expect(
    (await shared.db.triggeredAlert.findMany({ where: { id: { in: job.alertIds } } }))
      .map((row) => row.deliveryState)
      .sort(),
  ).toEqual(["digested", "digested", "skipped"]);
});
it("keeps unaffected alerts pending when the frozen digest becomes stale before transport", async () => {
  const { records, job } = await digestFixture();
  const prepared = await prepareAlertDigestDeliveryActivity(job as never);
  await shared.db.triggeredAlert.update({
    where: { id: records[1].row.id },
    data: { status: "resolved" },
  });
  const result = await deliverAlertDigestEmailActivity({
    job: prepared as never,
    recipient: job.recipients[0],
  });
  expect(result).toMatchObject({
    delivered: false,
    skipped: true,
    reason: "Alert is no longer deliverable.",
  });
  expect(result).not.toHaveProperty("unknown", true);
  expect(send).not.toHaveBeenCalled();
  expect(
    await finalizeAlertDigestDeliveryActivity({
      job: prepared as never,
      outcomes: [{ channel: "email", ...result }],
    }),
  ).toEqual({ deliveryState: "digest_pending" });
  const rows = await shared.db.triggeredAlert.findMany({ where: { id: { in: job.alertIds } } });
  expect(rows.find(({ id }) => id === records[1].row.id)?.deliveryState).toBe("skipped");
  expect(
    rows.filter(({ id }) => id !== records[1].row.id).map(({ deliveryState }) => deliveryState),
  ).toEqual(["digest_pending", "digest_pending"]);
  expect(
    await shared.db.deliveryAttempt.findFirst({ where: { triggeredAlertId: records[1].row.id } }),
  ).toMatchObject({ status: "skipped", error: "Alert is no longer deliverable." });
});
it("skips all digest alerts when none remain eligible", async () => {
  const { records, job } = await digestFixture();
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: job.alertIds } },
    data: { status: "resolved" },
  });
  expect(await prepareAlertDigestDeliveryActivity(job as never)).toBeNull();
  expect(
    await shared.db.deliveryAttempt.count({
      where: { triggeredAlertId: { in: records.map(({ row }) => row.id) }, status: "skipped" },
    }),
  ).toBe(3);
  expect(send).not.toHaveBeenCalled();
});
it("skips the whole digest when its rule is disabled", async () => {
  const { job } = await digestFixture();
  await shared.db.alertRule.update({ where: { id: ruleId }, data: { enabled: false } });
  try {
    expect(await prepareAlertDigestDeliveryActivity(job as never)).toBeNull();
    expect(
      await shared.db.deliveryAttempt.count({
        where: { triggeredAlertId: { in: job.alertIds }, status: "skipped" },
      }),
    ).toBe(3);
    expect(send).not.toHaveBeenCalled();
  } finally {
    await shared.db.alertRule.update({ where: { id: ruleId }, data: { enabled: true } });
  }
});
it("preserves all three eligible digest alerts", async () => {
  const { job } = await digestFixture();
  const prepared = await prepareAlertDigestDeliveryActivity(job as never);
  expect(prepared?.alertIds).toEqual(job.alertIds);
  expect(prepared?.email.subject).toContain("3 alerts");
  expect(
    await shared.db.deliveryAttempt.count({ where: { triggeredAlertId: { in: job.alertIds } } }),
  ).toBe(0);
});
it.each(["email", "slack", "webhook"] as const)(
  "persists a stale retried %s refusal as unknown in bell, peer summaries and health",
  async (channel) => {
    const { records, job } = await digestFixture();
    const prepared = await prepareAlertDigestDeliveryActivity({
      ...job,
      channels: [channel],
      recipients: [...job.recipients],
      slackConnection: { enabled: true, id: "fixture-slack" },
      webhookEndpointIds: [...job.webhookEndpointIds],
    });
    if (!prepared) throw new Error("Digest was not prepared");
    await shared.db.triggeredAlert.update({
      where: { id: records[1].row.id },
      data: { status: "resolved" },
    });
    // The first attempt may have reached the provider before it failed.
    activity.attempt = 2;
    const result =
      channel === "email"
        ? await deliverAlertDigestEmailActivity({ job: prepared, recipient: job.recipients[0] })
        : channel === "slack"
          ? await deliverAlertDigestSlackActivity(prepared)
          : await deliverAlertDigestWebhookActivity({
              job: prepared,
              endpointId: "fixture-webhook",
            });
    expect(result).toMatchObject({ delivered: false, skipped: false });
    expect(send).not.toHaveBeenCalled();
    const { notifyTriggeredAlertsDelivered: persistBell } = await vi.importActual<
      typeof import("@/lib/notifications/alert-delivery")
    >("@/lib/notifications/alert-delivery");
    vi.mocked(notifyTriggeredAlertsDelivered).mockImplementationOnce(persistBell);
    const now = new Date(Date.now() + 60_000);
    const healthBefore = await collectAlertDeliveryHealth(now, getAlertHealthConfig());
    expect(
      await finalizeAlertDigestDeliveryActivity({
        job: prepared,
        outcomes: [{ channel, ...result }],
      }),
    ).toEqual({ deliveryState: "dead_letter" });
    const rows = await shared.db.triggeredAlert.findMany({ where: { id: { in: job.alertIds } } });
    const counts = { acceptedCount: 0, failedCount: 0, unknownCount: 1 };
    const summary = [{ channel, status: "unknown", ...(channel === "email" ? { counts } : {}) }];
    for (const row of rows) {
      expect(row).toMatchObject({ deliveryState: "dead_letter", deliverySummary: summary });
    }
    const attempts = await shared.db.deliveryAttempt.findMany({
      where: { triggeredAlertId: { in: job.alertIds } },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      channel,
      status: "unknown",
      ...(channel === "email" ? counts : {}),
    });
    const bellRows = await shared.db.notification.findMany({
      where: {
        projectId,
        idempotencyKey: { in: job.alertIds.map((id) => `triggered-alert:${id}:delivered`) },
      },
    });
    expect(bellRows).toHaveLength(4);
    const feed = await listTriggeredAlertFeedViews(projectId, {
      where: [{ id: { in: job.alertIds } }],
    });
    expect(feed).toHaveLength(3);
    for (const row of feed) {
      expect(row.deliverySummary).toEqual(summary);
      expect(row.deliveryAttempts.every((attempt) => attempt.status === "unknown")).toBe(true);
    }
    const health = await collectAlertDeliveryHealth(now, getAlertHealthConfig());
    expect(health.failed).toBe(healthBefore.failed);
    expect(health.unknown).toBe(healthBefore.unknown + 1);
    expect(health.recipientCounts.failedCount).toBe(healthBefore.recipientCounts.failedCount);
    expect(health.recipientCounts.unknownCount).toBe(
      healthBefore.recipientCounts.unknownCount + (channel === "email" ? 1 : 0),
    );
    expect(result).toMatchObject({ unknown: true });
  },
);
it("keeps the digest budget reservation with the alerts it releases", async () => {
  const { records, job } = await digestFixture();
  const reservedAt = new Date("2026-11-03T05:00:00.000Z");
  for (const [index, { row }] of records.entries()) {
    await shared.db.triggeredAlert.update({
      where: { id: row.id },
      data: {
        firedAt: new Date(Date.now() - (3 - index) * 1000),
        deliveryBudgetReservedAt: index === 0 ? reservedAt : null,
      },
    });
  }
  const prepared = await prepareAlertDigestDeliveryActivity(job as never);
  await shared.db.triggeredAlert.update({
    where: { id: records[0].row.id },
    data: { status: "resolved" },
  });
  const result = await deliverAlertDigestEmailActivity({
    job: prepared as never,
    recipient: job.recipients[0],
  });
  expect(
    await finalizeAlertDigestDeliveryActivity({
      job: prepared as never,
      outcomes: [{ channel: "email", ...result }],
    }),
  ).toEqual({ deliveryState: "digest_pending" });
  const rows = await shared.db.triggeredAlert.findMany({ where: { id: { in: job.alertIds } } });
  const reserved = (index: number) =>
    rows.find(({ id }) => id === records[index].row.id)?.deliveryBudgetReservedAt ?? null;
  expect(reserved(0)).toBeNull();
  expect(reserved(1)).toEqual(reservedAt);
  expect(reserved(2)).toBeNull();
});
it("refuses stale or mismatched stable identifiers", async () => {
  const base = {
    alertId,
    projectInternalId: projectId,
    ruleId,
    recipientUserId: memberId,
    recipientEmail: "stale@example.com",
    payload,
  };
  for (const change of [
    { recipientUserId: "missing-user" },
    { projectInternalId: "missing-project" },
    { ruleId: "missing-rule" },
    { recipientUserId: undefined },
  ]) {
    expect(await deliverAlertEmailActivity({ ...base, ...change })).toMatchObject({
      delivered: false,
      skipped: true,
    });
  }
  const other = await shared.db.project.create({
    data: { publicId: makePublicId("prj"), ownerId, name: "Other fixture", domain: "example.org" },
  });
  try {
    expect(
      await deliverAlertEmailActivity({
        ...base,
        recipientUserId: ownerId,
        projectInternalId: other.id,
      }),
    ).toMatchObject({ delivered: false, skipped: true });
  } finally {
    await shared.db.project.delete({ where: { id: other.id } });
  }
  expect(send).not.toHaveBeenCalled();
});
it("refuses revoked consent after preparation", async () => {
  await shared.db.notificationPreference.create({
    data: { projectId, userId: memberId, alertEmail: false },
  });
  expect(await attempt()).toMatchObject({ skipped: true });
  expect(send).not.toHaveBeenCalled();
  await shared.db.notificationPreference.deleteMany({ where: { projectId, userId: memberId } });
});
it("finalizes a refused email as skipped and retains its reason", async () => {
  await shared.db.triggeredAlert.update({
    where: { id: alertId },
    data: { deliveryState: "delivering", deliveryClaimToken: "fixture-claim" },
  });
  await shared.db.notificationPreference.create({
    data: { projectId, userId: memberId, alertEmail: false },
  });
  const result = await attempt();
  expect(result).toMatchObject({ delivered: false, skipped: true });
  expect(
    await finalizeAlertDeliveryActivity({
      alertId,
      deliveryClaimToken: "fixture-claim",
      outcomes: [{ channel: "email", ...result }],
      payload,
      projectInternalId: projectId,
    }),
  ).toEqual({ deliveryState: "skipped" });
  expect(
    await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: alertId } }),
  ).toMatchObject({
    deliveryState: "skipped",
  });
  expect(
    await shared.db.deliveryAttempt.findFirst({
      where: {
        triggeredAlertId: alertId,
        status: "skipped",
        error: "Alert email consent is disabled.",
      },
    }),
  ).not.toBeNull();
  await shared.db.notificationPreference.deleteMany({ where: { projectId, userId: memberId } });
  await shared.db.triggeredAlert.update({
    where: { id: alertId },
    data: { deliveryState: "pending" },
  });
});
it("refuses a digest recipient whose consent changed after flush", async () => {
  const { job } = await digestFixture();
  await shared.db.notificationPreference.create({
    data: { projectId, userId: memberId, alertEmail: false },
  });
  expect(
    await deliverAlertDigestEmailActivity({
      job: job as never,
      recipient: { userId: memberId, email: "stale@example.com" },
    }),
  ).toMatchObject({ delivered: false, skipped: true });
  expect(send).not.toHaveBeenCalled();
  await shared.db.notificationPreference.deleteMany({ where: { projectId, userId: memberId } });
});
it("refuses a removed member but permits the owner without membership", async () => {
  await shared.db.membership.deleteMany({ where: { projectId, userId: memberId } });
  expect(await attempt()).toMatchObject({ skipped: true });
  expect(send).not.toHaveBeenCalled();
  expect(await attempt(ownerId)).toMatchObject({ delivered: true });
  expect(send).toHaveBeenCalledOnce();
});
it("gates push and in-app delivery by the rule switch", async () => {
  const message = { body: "b", collapseId: "c", data: {}, threadId: "t", title: "t" };
  const pushInput = { alertId, message, projectInternalId: projectId };
  const { job } = await digestFixture();
  const pushJob = { ...job, alerts: job.alerts, channels: ["push"] } as never;
  await shared.db.alertRule.update({ where: { id: ruleId }, data: { enabled: false } });
  try {
    const refused = { delivered: false, skipped: true, reason: "Alert is no longer deliverable." };
    expect(await deliverAlertPushActivity(pushInput)).toMatchObject(refused);
    expect(await deliverAlertDigestPushActivity(pushJob)).toMatchObject(refused);
    expect(pushToProject).not.toHaveBeenCalled();
    await shared.db.triggeredAlert.update({
      where: { id: alertId },
      data: { deliveryState: "delivering", deliveryClaimToken: "push-claim" },
    });
    await finalizeAlertDeliveryActivity({
      alertId,
      deliveryClaimToken: "push-claim",
      outcomes: [{ channel: "email", delivered: true }],
      payload,
      projectInternalId: projectId,
    });
    expect(
      await finalizeAlertDigestDeliveryActivity({
        job: job as never,
        outcomes: [{ channel: "email", delivered: true }],
      }),
    ).toEqual({ deliveryState: "digested" });
    expect(notifyTriggeredAlertDelivered).not.toHaveBeenCalled();
  } finally {
    await shared.db.alertRule.update({ where: { id: ruleId }, data: { enabled: true } });
    await shared.db.triggeredAlert.update({
      where: { id: alertId },
      data: { deliveryState: "pending", deliveryClaimToken: null },
    });
  }
  expect(await deliverAlertPushActivity(pushInput)).toMatchObject({ delivered: true });
  const { job: freshPushJob } = await digestFixture();
  expect(await deliverAlertDigestPushActivity(freshPushJob as never)).toMatchObject({
    delivered: true,
  });
  expect(pushToProject).toHaveBeenCalledTimes(2);
});
it("refuses a disabled rule and a snoozed alert", async () => {
  await shared.db.alertRule.update({ where: { id: ruleId }, data: { enabled: false } });
  expect(await attempt(ownerId)).toMatchObject({ skipped: true });
  const slack = await shared.db.slackConnection.create({
    data: {
      projectId,
      teamId: "fixture",
      channelId: "fixture",
      accessTokenHash: "fixture",
      enabled: true,
    },
  });
  const endpoint = await shared.db.webhookEndpoint.create({
    data: {
      publicId: makePublicId("we"),
      projectId,
      url: "https://example.com/hook",
      hmacSecret: "fixture",
      enabled: true,
    },
  });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(
    await deliverAlertSlackActivity({ alertId, payload, slackConnectionId: slack.id }),
  ).toMatchObject({ skipped: true });
  expect(
    await deliverAlertWebhookActivity({ alertId, payload, endpointId: endpoint.id }),
  ).toMatchObject({ skipped: true });
  const { job: ownedJob } = await digestFixture();
  const job = {
    ...ownedJob,
    slackConnection: { enabled: true, id: slack.id },
  } as never;
  expect(await deliverAlertDigestSlackActivity(job)).toMatchObject({
    delivered: false,
    skipped: true,
    reason: "Alert is no longer deliverable.",
  });
  expect(await deliverAlertDigestWebhookActivity({ job, endpointId: endpoint.id })).toMatchObject({
    delivered: false,
    skipped: true,
    reason: "Alert is no longer deliverable.",
  });
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  await shared.db.alertRule.update({ where: { id: ruleId }, data: { enabled: true } });
  await shared.db.triggeredAlert.update({
    where: { id: alertId },
    data: { snoozedUntil: new Date(Date.now() + 60000) },
  });
  expect(await attempt(ownerId)).toMatchObject({ skipped: true });
  expect(send).not.toHaveBeenCalled();
});
it("refuses a resolved alert", async () => {
  await shared.db.triggeredAlert.update({
    where: { id: alertId },
    data: { status: "resolved", snoozedUntil: null },
  });
  expect(await attempt(ownerId)).toMatchObject({ delivered: false, skipped: true });
  expect(send).not.toHaveBeenCalled();
});
it("finalizes a skipped digest when its original attempt anchor was deleted", async () => {
  const old = await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: alertId } });
  const survivor = await shared.db.triggeredAlert.create({
    data: {
      publicId: makePublicId("al"),
      ruleId,
      keywordId: old.keywordId,
      deliveryState: "digesting",
      digestSubmissionStarted: false,
      deliveryClaimToken: "fixture-claim",
    },
  });
  await shared.db.triggeredAlert.delete({ where: { id: alertId } });
  const job = {
    alertIds: [alertId, survivor.id],
    alerts: [{ alertId: survivor.publicId }],
    projectId,
    deliveryClaimToken: "fixture-claim",
    channels: ["email"],
  } as never;
  expect(
    await finalizeAlertDigestDeliveryActivity({
      job,
      outcomes: [{ channel: "email", delivered: false, skipped: true, reason: "Consent revoked." }],
    }),
  ).toEqual({ deliveryState: "skipped" });
  expect(
    await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: survivor.id } }),
  ).toMatchObject({ deliveryState: "skipped" });
  expect(
    await shared.db.deliveryAttempt.findFirst({ where: { triggeredAlertId: survivor.id } }),
  ).toMatchObject({ status: "skipped", error: "Consent revoked." });
  alertId = survivor.id;
});
it("returns a skip if the alert was deleted and its attempt FK cannot exist", async () => {
  await shared.db.triggeredAlert.delete({ where: { id: alertId } });
  expect(await attempt(ownerId)).toMatchObject({ skipped: true });
  expect(send).not.toHaveBeenCalled();
});
it("does not send a reclaimed digest when that logical message was already accepted", async () => {
  const keyword = await shared.db.keyword.findFirstOrThrow({ where: { projectId } });
  const restored = await shared.db.triggeredAlert.create({
    data: { publicId: makePublicId("al"), ruleId, keywordId: keyword.id },
  });
  alertId = restored.id;
  const { job } = await digestFixture();
  const recipient = job.recipients[0];
  if (!recipient) throw new Error("missing digest recipient");
  const identity = digestEmailIdentity({
    alertIds: job.alertIds,
    ruleId: job.ruleId,
    userId: recipient.userId,
  });
  expect(identity).toMatch(/^[0-9a-f]{64}$/);
  expect(await deliverAlertDigestEmailActivity({ job: job as never, recipient })).toMatchObject({
    delivered: true,
    skipped: false,
  });
  expect(
    await shared.db.preparedEmailMessage.findUnique({ where: { deliveryIdentity: identity } }),
  ).toMatchObject({
    deliveryInputs: digestEmailCanonicalEncoding({
      alertIds: job.alertIds,
      ruleId: job.ruleId,
      userId: recipient.userId,
    }),
    state: "accepted",
  });
  send.mockClear();
  expect(
    await deliverAlertDigestEmailActivity({
      job: { ...job, deliveryClaimToken: "reclaimed-token" } as never,
      recipient,
    }),
  ).toMatchObject({ delivered: true, skipped: false });
  expect(send).not.toHaveBeenCalled();
  await shared.db.preparedEmailMessage.update({
    data: { idempotent: false, state: "submitting" },
    where: { deliveryIdentity: identity },
  });
  expect(
    await deliverAlertDigestEmailActivity({
      job: { ...job, deliveryClaimToken: "third-token" } as never,
      recipient,
    }),
  ).toMatchObject({ skipped: false, unknown: true });
  expect(send).not.toHaveBeenCalled();
  expect(
    await shared.db.preparedEmailMessage.count({ where: { deliveryIdentity: identity } }),
  ).toBe(1);
});
it("inserts and dedupes a digest whose 200 alert ids exceed an indexed row", async () => {
  const keyword = await shared.db.keyword.findFirstOrThrow({ where: { projectId } });
  const claim = "full-digest-claim";
  await shared.db.triggeredAlert.createMany({
    data: Array.from({ length: 200 }, () => ({
      deliveryClaimToken: claim,
      deliveryState: "digesting" as const,
      digestSubmissionStarted: false,
      keywordId: keyword.id,
      publicId: makePublicId("al"),
      ruleId,
    })),
  });
  const alertIds = (
    await shared.db.triggeredAlert.findMany({
      select: { id: true },
      where: { deliveryClaimToken: claim },
    })
  ).map((row) => row.id);
  expect(alertIds).toHaveLength(200);
  const recipient = { email: "stale@example.com", userId: ownerId };
  const identity = digestEmailIdentity({ alertIds, ruleId, userId: ownerId });
  const inputs = digestEmailCanonicalEncoding({ alertIds, ruleId, userId: ownerId });
  expect(Buffer.byteLength(inputs)).toBeGreaterThan(2704);
  const job = {
    alertIds,
    alerts: [],
    channels: ["email"],
    conditionType: "position_drop",
    createdAt: new Date().toISOString(),
    deliveryClaimToken: claim,
    email: { html: "full", subject: "full", text: "full" },
    projectDomain: "example.com",
    projectId,
    projectName: "Fixture",
    recipients: [recipient],
    ruleId,
    ruleName: "Fixture",
    slackText: "full",
    suppressedTodayCount: 0,
    webhookBody: {} as never,
    webhookEndpointIds: [],
  };
  expect(await deliverAlertDigestEmailActivity({ job: job as never, recipient })).toMatchObject({
    delivered: true,
    skipped: false,
  });
  expect(
    await deliverAlertDigestEmailActivity({
      job: { ...job, deliveryClaimToken: "reclaimed-full" } as never,
      recipient,
    }),
  ).toMatchObject({ delivered: true, skipped: false });
  expect(send).toHaveBeenCalledTimes(1);
  const stored = await shared.db.preparedEmailMessage.findUniqueOrThrow({
    where: { deliveryIdentity: identity },
  });
  expect(stored.deliveryIdentity).toMatch(/^[0-9a-f]{64}$/);
  expect(stored.deliveryInputs).toBe(inputs);
  const indexes = await shared.db.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'prepared_email_messages' AND indexdef ILIKE '%deliveryInputs%'
  `;
  expect(indexes).toEqual([]);
  expect(
    await shared.db.preparedEmailMessage.count({ where: { deliveryIdentity: identity } }),
  ).toBe(1);
});
