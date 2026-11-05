import { getAlertFeedStats } from "@/lib/api/alert-feed-stats";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { recordDeliveryAttempt } from "./delivery";
import { finalizeAlertDigestDeliveryActivity } from "./digest-delivery";
import type { AlertDigestJob } from "./digest-types";
import { markProjectAlertsRead } from "./feed-mutations";
import { collectAlertDeliveryHealth } from "./health";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications/events", () => ({ notifyTriggeredAlertsDelivered: vi.fn() }));

let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
let ownerId: string;
let memberId: string;
let project: { id: string; publicId: string };
let otherProject: { id: string; publicId: string };
let alert: { id: string; publicId: string; ruleId: string };
let otherAlert: { id: string };

beforeAll(async () => {
  fixture = await closeoutPostgresFixture();
  shared.db = fixture.db;
  const owner = await shared.db.user.create({
    data: {
      publicId: makePublicId("usr"),
      email: "owner@example.com",
      name: "Owner",
    },
  });
  const member = await shared.db.user.create({
    data: {
      publicId: makePublicId("usr"),
      email: "member@example.org",
      name: "Member",
    },
  });
  ownerId = owner.id;
  memberId = member.id;
  const location = await shared.db.location.create({
    data: {
      canonicalKey: "delivery-clarity",
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
  const createProject = async (domain: string) => {
    const row = await shared.db.project.create({
      data: { publicId: makePublicId("prj"), ownerId, name: "Fixture", domain },
    });
    const keyword = await shared.db.keyword.create({
      data: {
        publicId: makePublicId("kw"),
        projectId: row.id,
        text: "fixture keyword",
        location: "United States",
        locationId: location.id,
        device: "desktop",
      },
    });
    const rule = await shared.db.alertRule.create({
      data: {
        publicId: makePublicId("alr"),
        projectId: row.id,
        createdById: ownerId,
        name: "Fixture rule",
        conditionType: "position_drop",
        targetType: "all",
        severity: "warning",
        channels: ["email"],
      },
    });
    const triggered = await shared.db.triggeredAlert.create({
      data: {
        publicId: makePublicId("al"),
        ruleId: rule.id,
        keywordId: keyword.id,
        deliveryState: "digesting",
        deliveryClaimToken: "fixture-claim",
      },
    });
    return { project: row, alert: triggered };
  };
  const first = await createProject("example.com");
  const second = await createProject("example.org");
  project = first.project;
  otherProject = second.project;
  alert = first.alert;
  otherAlert = second.alert;
}, 120_000);

afterAll(async () => {
  await fixture?.close();
}, 120_000);

it("persists measured counts and rejects negative or incomplete counter groups", async () => {
  await recordDeliveryAttempt(alert.id, "push", "partial", null, undefined, {
    acceptedCount: 1,
    failedCount: 1,
    unknownCount: 1,
  });
  expect(
    await shared.db.deliveryAttempt.findFirst({
      where: { triggeredAlertId: alert.id, channel: "push" },
    }),
  ).toMatchObject({ acceptedCount: 1, failedCount: 1, unknownCount: 1, status: "partial" });
  for (const counts of [
    { acceptedCount: -1, failedCount: 1, unknownCount: 0 },
    { acceptedCount: 0, failedCount: null, unknownCount: 1 },
  ]) {
    await expect(
      shared.db.deliveryAttempt.create({
        data: {
          triggeredAlertId: alert.id,
          channel: "push",
          status: "failed",
          ...counts,
        },
      }),
    ).rejects.toThrow();
  }
});

it("classifies mixed partial attempts before computing health and alarms", async () => {
  const attemptedAt = new Date(Date.now() + 2 * 86_400_000);
  const rows: Omit<Prisma.DeliveryAttemptCreateManyInput, "triggeredAlertId">[] = [
    { channel: "push", status: "partial", acceptedCount: 1, failedCount: 1, unknownCount: 0 },
    { channel: "push", status: "partial", acceptedCount: 1, failedCount: 0, unknownCount: 1 },
    { channel: "email", status: "sent", acceptedCount: 2, failedCount: 0, unknownCount: 0 },
    { channel: "email", status: "skipped" },
    { channel: "webhook", status: "unknown" },
    {
      channel: "email",
      status: "failed",
      attemptedAt: new Date(attemptedAt.getTime() - 86_400_000),
    },
  ];
  await shared.db.deliveryAttempt.createMany({
    data: rows.map((row, index) => ({
      id: `health-attempt-${index}`,
      triggeredAlertId: alert.id,
      attemptedAt,
      ...row,
    })),
  });
  try {
    await expect(
      collectAlertDeliveryHealth(new Date(attemptedAt.getTime() + 30 * 60_000), {
        failureRateThreshold: 0.4,
        minAttempts: 2,
        spikeMin: 20,
        spikeMultiplier: 3,
        windowHours: 1,
      }),
    ).resolves.toMatchObject({
      total: 4,
      attemptCount: 4,
      partial: 2,
      failed: 1,
      unknown: 2,
      failureRate: 0.25,
      alarm: false,
      recipientCounts: { acceptedCount: 4, failedCount: 1, unknownCount: 1 },
      perChannel: {
        push: { failed: 1, unknown: 1, sent: 0, skipped: 0, total: 2 },
        email: { failed: 0, unknown: 0, sent: 1, skipped: 1, total: 1 },
        webhook: { failed: 0, unknown: 1, sent: 0, skipped: 0, total: 1 },
      },
    });
  } finally {
    await shared.db.deliveryAttempt.deleteMany({
      where: { id: { startsWith: "health-attempt-" } },
    });
  }
});

it("stores digest email totals, retaining unknown separately from failed", async () => {
  const original = await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: alert.id } });
  const peer = await shared.db.triggeredAlert.create({
    data: {
      publicId: makePublicId("al"),
      ruleId: alert.ruleId,
      keywordId: original.keywordId,
      deliveryState: "digesting",
      deliveryClaimToken: "fixture-claim",
    },
  });
  const job: AlertDigestJob = {
    alertIds: [alert.id, peer.id],
    alerts: [],
    channels: ["email"],
    conditionType: "position_drop",
    createdAt: new Date().toISOString(),
    deliveryClaimToken: "fixture-claim",
    email: { subject: "Fixture", html: "Fixture", text: "Fixture" },
    projectDomain: "example.com",
    projectId: project.id,
    projectName: "Fixture",
    recipients: [],
    ruleId: alert.ruleId,
    ruleName: "Fixture",
    slackText: "Fixture",
    suppressedTodayCount: 0,
    webhookBody: {
      created_at: new Date().toISOString(),
      event: "alert.digest",
      schemaVersion: 3,
      data: {
        alert_count: 0,
        alerts: [],
        condition_type: "position_drop",
        project_domain: "example.com",
        project_id: project.publicId,
        rule_id: makePublicId("alr"),
        rule_name: "Fixture",
        suppressed_today_count: 0,
      },
    },
    webhookEndpointIds: [],
  };
  await finalizeAlertDigestDeliveryActivity({
    job,
    outcomes: [
      { channel: "email", delivered: true },
      { channel: "email", delivered: false, unknown: true },
      { channel: "email", delivered: false },
      { channel: "email", delivered: false, skipped: true },
    ],
  });
  expect(
    await shared.db.deliveryAttempt.findFirst({
      where: { triggeredAlertId: alert.id, channel: "email" },
    }),
  ).toMatchObject({ acceptedCount: 1, failedCount: 1, unknownCount: 1, status: "partial" });
  const finalized = await shared.db.triggeredAlert.findMany({
    where: { id: { in: job.alertIds } },
  });
  expect(finalized).toHaveLength(2);
  for (const row of finalized)
    expect(row).toMatchObject({
      deliverySummary: [
        {
          channel: "email",
          counts: { acceptedCount: 1, failedCount: 1, unknownCount: 1 },
          status: "partial",
        },
      ],
    });
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: job.alertIds } },
    data: { deliveryState: "digesting", deliveryClaimToken: "unknown-claim" },
  });
  await finalizeAlertDigestDeliveryActivity({
    job: { ...job, channels: ["push"], deliveryClaimToken: "unknown-claim" },
    outcomes: [{ channel: "push", delivered: false, unknown: true }],
  });
  const unknown = await shared.db.triggeredAlert.findMany({ where: { id: { in: job.alertIds } } });
  for (const row of unknown)
    expect(row).toMatchObject({ deliverySummary: [{ channel: "push", status: "unknown" }] });
  await shared.db.triggeredAlert.delete({ where: { id: peer.id } });
});

it("reconciles snooze IDs and counts in the real feed query", async () => {
  await shared.db.triggeredAlert.update({
    where: { id: alert.id },
    data: { snoozedUntil: new Date(Date.now() + 86_400_000) },
  });
  expect(await getAlertFeedStats(project.id)).toMatchObject({
    snoozedInWindowCount: 1,
    snoozedAlertIds: [alert.publicId],
    unacknowledgedCount: 1,
  });
});

it("acknowledges one project for the team and preserves the original actor/time", async () => {
  const actor = { id: ownerId, memberships: [{ projectId: project.id, role: "admin" as const }] };
  await expect(markProjectAlertsRead({ actor, projectId: project.publicId })).resolves.toEqual({
    updated: 1,
  });
  const first = await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: alert.id } });
  expect(first).toMatchObject({
    status: "acknowledged",
    acknowledgedById: ownerId,
    acknowledgedByName: "Owner",
  });
  expect(first.acknowledgedAt).toBeInstanceOf(Date);
  expect(
    await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: otherAlert.id } }),
  ).toMatchObject({ status: "firing" });
  await markProjectAlertsRead({
    actor: { id: memberId, memberships: [{ projectId: project.id, role: "admin" }] },
    projectId: project.publicId,
  });
  expect(
    await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: alert.id } }),
  ).toMatchObject({ acknowledgedById: ownerId, acknowledgedAt: first.acknowledgedAt });
  await expect(markProjectAlertsRead({ actor, projectId: otherProject.publicId })).rejects.toThrow(
    "not authorized",
  );
  await expect(
    markProjectAlertsRead({
      actor: { id: memberId, memberships: [{ projectId: project.id, role: "viewer" }] },
      projectId: project.publicId,
    }),
  ).rejects.toThrow("not authorized");
});
