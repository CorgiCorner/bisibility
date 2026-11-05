import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { notifyTriggeredAlertDelivered } from "@/lib/notifications/events";
import { finalizeAlertDeliveryActivity } from "@/lib/temporal/alert-delivery-channels";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { finalizeAlertDigestDeliveryActivity } from "./digest-delivery";
import type { AlertDigestJob } from "./digest-types";
import { buildAlertDigestWebhookBody } from "./webhook-envelope";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
const publish = vi.hoisted(() => vi.fn(async (_event: unknown) => {}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: publish }));
let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
let locationId: string;
let insertSizes: number[] = [];

beforeAll(async () => {
  fixture = await closeoutPostgresFixture({ schemaOnly: true });
  shared.db = fixture.db;
  fixture.db.$on("query", ({ query }) => {
    if (query.startsWith("INSERT") && query.includes('"notifications"')) {
      insertSizes.push([...query.matchAll(/\(\$\d+[^)]*\)/g)].length);
    }
  });
  locationId = (
    await shared.db.location.create({
      data: {
        canonicalKey: "bell-finalization",
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
    })
  ).id;
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});

async function seed(alertCount = 2, recipientCount = 2) {
  const suffix = randomUUID();
  const users = await shared.db.user.createManyAndReturn({
    data: Array.from({ length: recipientCount + 1 }, (_, i) => ({
      publicId: makePublicId("usr"),
      email: `${suffix}-${i}@example.com`,
      name: `Member ${i}`,
    })),
  });
  const project = await shared.db.project.create({
    data: {
      publicId: makePublicId("prj"),
      ownerId: users[0].id,
      name: "Fixture",
      domain: "example.com",
    },
  });
  // Include the owner membership to exercise recipient deduplication.
  await shared.db.membership.createMany({
    data: users.map((user) => ({
      publicId: makePublicId("mbr"),
      projectId: project.id,
      userId: user.id,
    })),
  });
  const optedOut = users.at(-1);
  if (!optedOut) throw new Error("Missing opted-out fixture member");
  await shared.db.notificationPreference.create({
    data: {
      projectId: project.id,
      userId: optedOut.id,
      alertInApp: false,
    },
  });
  const keyword = await shared.db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId: project.id,
      text: "fixture",
      location: "United States",
      locationId,
    },
  });
  const rule = await shared.db.alertRule.create({
    data: {
      publicId: makePublicId("alr"),
      projectId: project.id,
      name: "Drop",
      conditionType: "position_drop",
      severity: "warning",
      channels: ["email"],
    },
  });
  const alerts = await shared.db.triggeredAlert.createManyAndReturn({
    data: Array.from({ length: alertCount }, () => ({
      publicId: makePublicId("al"),
      ruleId: rule.id,
      keywordId: keyword.id,
      deliveryState: "digesting",
      deliveryClaimToken: "claim",
    })),
    select: { id: true, publicId: true },
  });
  const payloads = [...alerts].reverse().map((a) => ({
    action: "Review it.",
    headline: "Ranking dropped",
    afterPosition: 12,
    beforePosition: 4,
    alertId: a.publicId,
    conditionType: "position_drop",
    firedAt: "2026-11-04T06:00:00.000Z",
    keyword: "fixture",
    keywordId: keyword.publicId,
    projectDomain: "example.com",
    projectId: project.publicId,
    ruleId: rule.publicId,
    ruleName: "Drop",
  }));
  const job: AlertDigestJob = {
    alertIds: alerts.map((a) => a.id),
    alerts: payloads,
    channels: ["email"],
    conditionType: "position_drop",
    createdAt: "2026-11-04T06:00:00.000Z",
    deliveryClaimToken: "claim",
    email: { html: "<p>Digest</p>", subject: "Digest", text: "Digest" },
    projectDomain: "example.com",
    projectId: project.id,
    projectName: "Fixture",
    recipients: [],
    ruleId: rule.id,
    ruleName: "Drop",
    slackText: "Digest",
    suppressedTodayCount: 0,
    webhookEndpointIds: [],
    webhookBody: buildAlertDigestWebhookBody(
      {
        alert_count: alerts.length,
        alerts: payloads,
        condition_type: "position_drop",
        project_domain: "example.com",
        project_id: project.publicId,
        rule_id: rule.publicId,
        rule_name: "Drop",
        suppressed_today_count: 0,
      },
      "2026-11-04T06:00:00.000Z",
    ),
  };
  return {
    project,
    alerts,
    job,
    users,
    optedOut,
    async finalize(mode: "single" | "digest") {
      if (mode === "digest")
        return finalizeAlertDigestDeliveryActivity({
          job,
          outcomes: [{ channel: "email", delivered: true }],
        });
      return finalizeAlertDeliveryActivity({
        alertId: alerts[0].id,
        deliveryClaimToken: "claim",
        projectInternalId: project.id,
        payload: { ...payloads[0], alertId: alerts[0].publicId },
        outcomes: [{ channel: "email", delivered: true, recordAttempt: true }],
      });
    },
  };
}

it("finalizes 200 alerts for 20 recipients with bounded SQL work and idempotent replay", async () => {
  const s = await seed(200, 20);
  const existingPayload = s.job.alerts.find((p) => p.alertId === s.alerts[0].publicId);
  if (!existingPayload) throw new Error("Missing alert fixture payload");
  await notifyTriggeredAlertDelivered({
    projectInternalId: s.project.id,
    triggeredAlertId: s.alerts[0].id,
    payload: existingPayload,
  });
  insertSizes = [];
  const before = fixture.statements();
  const start = performance.now();
  await s.finalize("digest");
  const elapsed = performance.now() - start;
  const statements = fixture.statements() - before;
  // Excludes fixture creation and readback, includes the actual finalization transaction.
  expect(statements).toBeLessThan(50);
  expect(insertSizes.length).toBeGreaterThan(0);
  expect(insertSizes.reduce((sum, size) => sum + size, 0)).toBe(4_000);
  expect(insertSizes.every((size) => size > 0 && size <= 500)).toBe(true);
  console.info(
    `Full digest: ${statements} SQL statements, ${insertSizes.join(",")} rows per insert, ${elapsed.toFixed(0)}ms`,
  );
  expect(elapsed).toBeLessThan(20_000);
  const rows = await shared.db.notification.findMany({
    where: { projectId: s.project.id },
    orderBy: { id: "asc" },
  });
  expect(rows).toHaveLength(4_000);
  expect(rows.some((r) => r.userId === s.optedOut.id)).toBe(false);
  for (const alert of s.alerts) {
    const recipients = rows.filter(
      (r) => r.idempotencyKey === `triggered-alert:${alert.id}:delivered`,
    );
    expect(recipients.map((r) => r.userId).sort()).toEqual(
      s.users
        .slice(0, -1)
        .map((u) => u.id)
        .sort(),
    );
    expect(
      recipients.every((r) => (r.payload as { alertId: string }).alertId === alert.publicId),
    ).toBe(true);
  }
  expect(
    await shared.db.triggeredAlert.count({
      where: {
        id: { in: s.job.alertIds },
        deliveryState: "digested",
        deliveryClaimToken: null,
      },
    }),
  ).toBe(200);
  const attempts = await shared.db.deliveryAttempt.count({
    where: { triggeredAlertId: { in: s.job.alertIds } },
  });
  await s.finalize("digest");
  expect(
    await shared.db.notification.findMany({
      where: { projectId: s.project.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(rows);
  expect(
    await shared.db.deliveryAttempt.count({ where: { triggeredAlertId: { in: s.job.alertIds } } }),
  ).toBe(attempts);
});

// No sleeps decide the ordering: continue only after PostgreSQL reports the blocked finalizer.
async function waitForBlockedFinalizer(deleterPid: number) {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const blockers = await shared.db.$queryRaw<Array<{ pid: number }>>`
      SELECT pid FROM pg_stat_activity
      WHERE ${deleterPid} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'
    `;
    if (blockers.length) return;
    await delay(10);
  }
  throw new Error("Finalizer did not block on the deleting transaction");
}

describe.each(["single", "digest"] as const)("%s finalization versus project deletion", (mode) => {
  it("lets both connections finish without a deadlock or a missing-project insert", async () => {
    const s = await seed();
    if (mode === "single")
      await shared.db.triggeredAlert.updateMany({
        where: { id: { in: s.job.alertIds } },
        data: { deliveryState: "delivering" },
      });
    await fixture.client.query("BEGIN");
    let finalization: Promise<unknown> | undefined;
    try {
      await fixture.client.query("SET LOCAL statement_timeout = '8s'");
      await fixture.client.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [s.project.id]);
      const {
        rows: [{ pid }],
      } = await fixture.client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      finalization = s.finalize(mode);
      // Attach a rejection handler before yielding to the deletion connection.
      const result = Promise.allSettled([finalization]);
      await waitForBlockedFinalizer(pid);
      await fixture.client.query("DELETE FROM projects WHERE id=$1", [s.project.id]);
      await fixture.client.query("COMMIT");
      expect(await result).toEqual([
        {
          status: "fulfilled",
          value: {
            deliveryState: mode === "digest" ? "digested" : "delivered",
          },
        },
      ]);
      expect(await shared.db.project.count({ where: { id: s.project.id } })).toBe(0);
      expect(await shared.db.triggeredAlert.count({ where: { id: { in: s.job.alertIds } } })).toBe(
        0,
      );
      expect(
        await shared.db.notification.count({ where: { userId: { in: s.users.map((u) => u.id) } } }),
      ).toBe(0);
    } finally {
      await fixture.client.query("ROLLBACK");
      if (finalization) await Promise.allSettled([finalization]);
    }
  });
});

it.each(["alertIds", "alerts"] as const)(
  "rejects more than 200 %s before mutating the digest",
  async (field) => {
    const s = await seed(200);
    if (field === "alertIds") s.job.alertIds.push(s.job.alertIds[0]);
    else s.job.alerts.push(s.job.alerts[0]);
    await expect(s.finalize("digest")).rejects.toThrow("200");
    expect(await shared.db.notification.count({ where: { projectId: s.project.id } })).toBe(0);
    expect(
      await shared.db.deliveryAttempt.count({
        where: { triggeredAlertId: { in: s.job.alertIds } },
      }),
    ).toBe(0);
    expect(
      await shared.db.triggeredAlert.count({
        where: {
          id: { in: s.job.alertIds },
          deliveryState: "digesting",
          deliveryClaimToken: "claim",
        },
      }),
    ).toBe(200);
  },
);
