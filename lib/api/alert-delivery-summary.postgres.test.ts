import { finalizeAlertDigestDeliveryActivity } from "@/lib/alerts/digest-delivery";
import type { AlertDigestJob } from "@/lib/alerts/digest-types";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { listTriggeredAlertFeedViews } from "./alert-list";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/notifications/events", () => ({ notifyTriggeredAlertsDelivered: vi.fn() }));

let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
let projectId: string;
let keywordId: string;
let ruleId: string;
let endpoints: { id: string; publicId: string }[];

beforeAll(async () => {
  fixture = await closeoutPostgresFixture();
  shared.db = fixture.db;
  const user = await shared.db.user.create({
    data: {
      publicId: makePublicId("usr"),
      name: "Owner",
      email: "feed-owner@example.com",
    },
  });
  const project = await shared.db.project.create({
    data: {
      publicId: makePublicId("prj"),
      name: "Fixture",
      domain: "example.com",
      ownerId: user.id,
    },
  });
  projectId = project.id;
  const location = await shared.db.location.create({
    data: {
      canonicalKey: "complete-delivery-feed",
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
  const keyword = await shared.db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId,
      text: "fixture keyword",
      location: "United States",
      locationId: location.id,
      device: "desktop",
    },
  });
  keywordId = keyword.id;
  const rule = await shared.db.alertRule.create({
    data: {
      publicId: makePublicId("alr"),
      projectId,
      createdById: user.id,
      name: "Fixture rule",
      conditionType: "position_drop",
      targetType: "all",
      severity: "warning",
      channels: ["email"],
    },
  });
  ruleId = rule.id;
  endpoints = await Promise.all(
    ["first", "second"].map((name) =>
      shared.db.webhookEndpoint.create({
        data: {
          publicId: makePublicId("we"),
          projectId,
          url: `https://example.org/${name}`,
          hmacSecret: "fixture",
        },
      }),
    ),
  );
}, 120_000);

afterAll(async () => {
  await fixture?.close();
}, 120_000);

async function createAlert(deliveryState: "delivered" | "digesting" = "delivered") {
  return shared.db.triggeredAlert.create({
    data: {
      publicId: makePublicId("al"),
      ruleId,
      keywordId,
      deliveryState,
      deliveryClaimToken: deliveryState === "digesting" ? "fixture-claim" : null,
    },
  });
}

async function loadAlert(publicId: string | null) {
  if (!publicId) throw new Error("Fixture public ID is missing.");
  const rows = await listTriggeredAlertFeedViews(projectId, { where: [{ publicId }] });
  expect(rows).toHaveLength(1);
  return rows[0];
}

it.each(["failed", "unknown", "sent"] as const)(
  "retains the first %s email recipient outside the three-row display window",
  async (status) => {
    const alert = await createAlert();
    await shared.db.deliveryAttempt.createMany({
      data: [status, "sent", "sent", "sent"].map((status, index) => ({
        triggeredAlertId: alert.id,
        channel: "email",
        status,
        attemptedAt: new Date(Date.now() - 10_000 + index * 1000),
      })),
    });
    const loaded = await loadAlert(alert.publicId);
    expect(loaded.deliveryAttempts).toHaveLength(3);
    expect(loaded.deliveryAttempts.every((row) => row.status === "sent")).toBe(true);
    expect(loaded.deliveryOutcomes).toHaveLength(4);
    expect(loaded.deliveryOutcomes?.map((row) => row.status).sort()).toEqual(
      [status, "sent", "sent", "sent"].sort(),
    );
    expect(JSON.stringify(loaded)).not.toContain(alert.id);
  },
);

it.each(["failed", "unknown", "sent"] as const)(
  "retains a distinct endpoint's %s outcome behind later successful channels",
  async (status) => {
    const alert = await createAlert();
    const attempts: Omit<Prisma.DeliveryAttemptCreateManyInput, "triggeredAlertId">[] = [
      { channel: "webhook", status, webhookEndpointId: endpoints[0].id },
      { channel: "webhook", status: "sent", webhookEndpointId: endpoints[1].id },
      { channel: "push", status: "sent" },
      { channel: "slack", status: "sent" },
    ];
    await shared.db.deliveryAttempt.createMany({
      data: attempts.map((row, index) => ({
        ...row,
        triggeredAlertId: alert.id,
        attemptedAt: new Date(Date.now() - 10_000 + index * 1000),
      })),
    });
    const loaded = await loadAlert(alert.publicId);
    expect(loaded.deliveryAttempts).toHaveLength(3);
    expect(
      loaded.deliveryOutcomes
        ?.filter((row) => row.channel === "webhook")
        .map((row) => row.status)
        .sort(),
    ).toEqual([status, "sent"].sort());
    expect(JSON.stringify(loaded)).not.toContain(endpoints[0].id);
  },
);

it("uses a recovered endpoint's final result without hiding other destinations", async () => {
  const alert = await createAlert();
  await shared.db.deliveryAttempt.createMany({
    data: ["unknown", "failed", "sent"].map((status, index) => ({
      triggeredAlertId: alert.id,
      channel: "webhook",
      status,
      webhookEndpointId: endpoints[0].id,
      attemptedAt: new Date(Date.now() - 10_000 + index * 1000),
    })),
  });
  expect((await loadAlert(alert.publicId)).deliveryOutcomes).toEqual([
    { channel: "webhook", status: "sent" },
  ]);
});

it("retains unresolved webhook outcomes when their destination identity was deleted", async () => {
  const alert = await createAlert();
  await shared.db.deliveryAttempt.createMany({
    data: ["unknown", "sent"].map((status, index) => ({
      triggeredAlertId: alert.id,
      channel: "webhook",
      status,
      attemptedAt: new Date(Date.now() - 10_000 + index * 1000),
    })),
  });
  expect(
    (await loadAlert(alert.publicId)).deliveryOutcomes?.map((row) => row.status).sort(),
  ).toEqual(["sent", "unknown"]);
});

it.each([
  ["email", "slack", "failed"],
  ["email", "webhook", "failed"],
  ["email", "webhook", "unknown"],
  ["webhook", "webhook", "failed"],
  ["webhook", "webhook", "unknown"],
  ["webhook", "webhook", "sent"],
  ["email", "slack", "sent"],
] as const)(
  "shares %s success and %s %s with every digest peer",
  async (accepted, channel, status) => {
    const alerts = await Promise.all([createAlert("digesting"), createAlert("digesting")]);
    const job: AlertDigestJob = {
      alertIds: alerts.map((alert) => alert.id),
      alerts: [],
      channels: [...new Set([accepted, channel])],
      conditionType: "position_drop",
      createdAt: new Date().toISOString(),
      deliveryClaimToken: "fixture-claim",
      email: { subject: "Fixture", html: "Fixture", text: "Fixture" },
      projectDomain: "example.com",
      projectId,
      projectName: "Fixture",
      recipients: [],
      ruleId,
      ruleName: "Fixture",
      slackText: "Fixture",
      suppressedTodayCount: 0,
      webhookBody: {
        event: "alert.digest",
        schemaVersion: 3,
        created_at: new Date().toISOString(),
        data: {
          alert_count: 0,
          alerts: [],
          condition_type: "position_drop",
          project_domain: "example.com",
          project_id: makePublicId("prj"),
          rule_id: makePublicId("alr"),
          rule_name: "Fixture",
          suppressed_today_count: 0,
        },
      },
      webhookEndpointIds: endpoints.map((endpoint) => endpoint.id),
    };
    await finalizeAlertDigestDeliveryActivity({
      job,
      outcomes: [
        {
          channel: accepted,
          delivered: true,
          ...(accepted === "webhook" ? { webhookEndpointId: endpoints[0].id } : {}),
        },
        {
          channel,
          delivered: status === "sent",
          unknown: status === "unknown",
          ...(channel === "webhook" ? { webhookEndpointId: endpoints[1].id } : {}),
        },
      ],
    });
    const loaded = await Promise.all(alerts.map((alert) => loadAlert(alert.publicId)));
    for (const alert of loaded) {
      expect(alert.deliveryState).toBe("digested");
      expect(alert.deliverySummary).toEqual([
        {
          channel: accepted,
          status: "sent",
          ...(accepted === "email"
            ? { counts: { acceptedCount: 1, failedCount: 0, unknownCount: 0 } }
            : {}),
        },
        { channel, status },
      ]);
    }
    expect(loaded.map((alert) => alert.deliveryAttempts.length).sort()).toEqual([0, 2]);
  },
);
