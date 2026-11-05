import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { notifyTriggeredAlertDelivered } from "@/lib/notifications/events";
import { finalizeAlertDeliveryActivity } from "@/lib/temporal/alert-delivery-channels";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
let ownerId: string;
let memberId: string;
let projectId: string;
let ruleId: string;
let refs: { project: string; rule: string; keyword: string };
let alerts: Array<{ id: string; publicId: string }>;

beforeAll(async () => {
  fixture = await closeoutPostgresFixture({ schemaOnly: true });
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
  const project = await shared.db.project.create({
    data: {
      publicId: makePublicId("prj"),
      ownerId,
      name: "Fixture",
      domain: "example.com",
    },
  });
  projectId = project.id;
  await shared.db.membership.create({
    data: {
      publicId: makePublicId("mbr"),
      projectId,
      userId: memberId,
    },
  });
  const location = await shared.db.location.create({
    data: {
      canonicalKey: "bell-fixture",
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
      text: "fixture",
      location: "United States",
      locationId: location.id,
    },
  });
  const rule = await shared.db.alertRule.create({
    data: {
      publicId: makePublicId("alr"),
      projectId,
      name: "Drop",
      conditionType: "position_drop",
      severity: "warning",
      channels: ["email"],
    },
  });
  ruleId = rule.id;
  refs = { project: project.publicId, rule: rule.publicId, keyword: keyword.publicId };
  alerts = await shared.db.triggeredAlert.createManyAndReturn({
    data: [0, 1].map(() => ({
      publicId: makePublicId("al"),
      ruleId,
      keywordId: keyword.id,
    })),
    select: { id: true, publicId: true },
  });
}, 60_000);

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T06:00:00.000Z"));
  publish.mockReset();
  await shared.db.notification.deleteMany({ where: { projectId } });
  await shared.db.notificationPreference.deleteMany({ where: { projectId } });
  await shared.db.deliveryAttempt.deleteMany({
    where: { triggeredAlertId: { in: alerts.map((a) => a.id) } },
  });
  await shared.db.alertRule.update({ where: { id: ruleId }, data: { enabled: true } });
  await shared.db.triggeredAlert.updateMany({
    where: { ruleId },
    data: {
      deliveryState: "delivering",
      deliveryClaimToken: "claim",
      deliveryClaimedAt: new Date(),
      deliveredAt: null,
      resolvedAt: null,
      snoozedUntil: null,
    },
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await fixture.client.query("DROP TRIGGER IF EXISTS reject_member ON notifications");
});
afterAll(async () => {
  await fixture?.close();
});

function payload(alert = alerts[0]) {
  return {
    action: "Review it.",
    headline: "Ranking dropped",
    afterPosition: 12,
    beforePosition: 4,
    alertId: alert.publicId,
    conditionType: "position_drop",
    firedAt: "2026-11-04T06:00:00.000Z",
    keyword: "fixture",
    keywordId: refs.keyword,
    projectDomain: "example.com",
    projectId: refs.project,
    ruleId: refs.rule,
    ruleName: "Drop",
  };
}
async function rejectMember() {
  await fixture.client.query(`CREATE OR REPLACE FUNCTION reject_bell_member() RETURNS trigger AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM users WHERE id=NEW."userId" AND email='member@example.org')
      THEN RAISE EXCEPTION 'fixture member insert failure'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER reject_member BEFORE INSERT ON notifications
    FOR EACH ROW EXECUTE FUNCTION reject_bell_member()`);
}
async function rows() {
  return shared.db.notification.findMany({ where: { projectId }, orderBy: { id: "asc" } });
}
async function claim(mode: "single" | "digest") {
  if (mode === "digest")
    await shared.db.triggeredAlert.updateMany({
      where: { ruleId },
      data: { deliveryState: "digesting" },
    });
  const contents = [...alerts].reverse().map((alert) => payload(alert));
  const job: AlertDigestJob = {
    alertIds: alerts.map((a) => a.id),
    alerts: contents,
    channels: ["email"],
    conditionType: "position_drop",
    createdAt: "2026-11-04T06:00:00.000Z",
    deliveryClaimToken: "claim",
    email: { html: "<p>Digest</p>", subject: "Digest", text: "Digest" },
    projectDomain: "example.com",
    projectId,
    projectName: "Fixture",
    recipients: [],
    ruleId,
    ruleName: "Drop",
    slackText: "Digest",
    suppressedTodayCount: 0,
    webhookEndpointIds: [],
    webhookBody: buildAlertDigestWebhookBody(
      {
        alert_count: 2,
        alerts: contents,
        condition_type: "position_drop",
        project_domain: "example.com",
        project_id: contents[0].projectId,
        rule_id: contents[0].ruleId,
        rule_name: "Drop",
        suppressed_today_count: 0,
      },
      "2026-11-04T06:00:00.000Z",
    ),
  };
  return {
    ids: mode === "digest" ? job.alertIds : [alerts[0].id],
    finalize: () =>
      mode === "digest"
        ? finalizeAlertDigestDeliveryActivity({
            job,
            outcomes: [{ channel: "email", delivered: true }],
          })
        : finalizeAlertDeliveryActivity({
            alertId: alerts[0].id,
            deliveryClaimToken: "claim",
            projectInternalId: projectId,
            payload: payload(alerts[0]),
            outcomes: [{ channel: "email", delivered: true, recordAttempt: true }],
          }),
  };
}

describe.each(["single", "digest"] as const)("%s bell finalization durability", (mode) => {
  it("rolls back all rows and finalization on one member failure, then retries once", async () => {
    const c = await claim(mode);
    await rejectMember();
    await expect(c.finalize()).rejects.toThrow("fixture member insert failure");
    expect(await rows()).toHaveLength(0);
    expect(
      await shared.db.triggeredAlert.findMany({
        where: { id: { in: c.ids } },
        select: { deliveryState: true, deliveryClaimToken: true },
      }),
    ).toEqual(
      c.ids.map(() => ({
        deliveryState: mode === "digest" ? "digesting" : "delivering",
        deliveryClaimToken: "claim",
      })),
    );
    expect(await shared.db.deliveryAttempt.count()).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    await fixture.client.query("DROP TRIGGER reject_member ON notifications");
    await c.finalize();
    const committed = await rows();
    expect(committed).toHaveLength(c.ids.length * 2);
    for (const row of committed) {
      const alert = alerts.find((a) => row.idempotencyKey === `triggered-alert:${a.id}:delivered`);
      expect(row.payload).toMatchObject({ alertId: alert?.publicId });
    }
    for (const id of c.ids)
      expect(
        committed
          .filter((n) => n.idempotencyKey === `triggered-alert:${id}:delivered`)
          .map((n) => n.userId)
          .sort(),
      ).toEqual([ownerId, memberId].sort());
    const attempts = await shared.db.deliveryAttempt.count();
    await c.finalize();
    expect(await rows()).toEqual(committed);
    expect(await shared.db.deliveryAttempt.count()).toBe(attempts);
    expect(publish).toHaveBeenCalledTimes(committed.length);
  });

  it("keeps every row when the process loses the transaction result after commit", async () => {
    const c = await claim(mode);
    const transact = shared.db.$transaction.bind(shared.db);
    vi.spyOn(shared.db, "$transaction").mockImplementationOnce(async (callback, options) => {
      if (typeof callback !== "function") throw new Error("Expected interactive transaction");
      await transact(callback, options);
      throw new Error("fixture crash after commit");
    });
    await expect(c.finalize()).rejects.toThrow("fixture crash after commit");
    const committed = await rows();
    expect(committed).toHaveLength(c.ids.length * 2);
    expect(publish).not.toHaveBeenCalled();
    await c.finalize();
    expect(await rows()).toEqual(committed);
  });

  it("publishes only committed rows and keeps them when realtime fails", async () => {
    const c = await claim(mode);
    const observedCounts: number[] = [];
    publish.mockImplementation(async () => {
      observedCounts.push((await rows()).length);
      throw new Error("fixture realtime unavailable");
    });
    await c.finalize();
    const committed = await rows();
    expect(committed).toHaveLength(c.ids.length * 2);
    expect(publish).toHaveBeenCalledTimes(committed.length);
    expect(observedCounts).toEqual(committed.map(() => committed.length));
    await c.finalize();
    expect(await rows()).toEqual(committed);
  });

  it("intentionally skips alertInApp=false without blocking finalization", async () => {
    const c = await claim(mode);
    await shared.db.notificationPreference.create({
      data: { projectId, userId: memberId, alertInApp: false },
    });
    await c.finalize();
    expect((await rows()).map((n) => n.userId)).toEqual(c.ids.map(() => ownerId));
    expect(
      await shared.db.triggeredAlert.count({
        where: {
          id: { in: c.ids },
          deliveryState: mode === "digest" ? "digested" : "delivered",
          deliveryClaimToken: null,
        },
      }),
    ).toBe(c.ids.length);
  });

  it("keeps the rule and alert eligibility gate inside finalization", async () => {
    const c = await claim(mode);
    await shared.db.alertRule.update({ where: { id: ruleId }, data: { enabled: false } });
    await c.finalize();
    expect(await rows()).toHaveLength(0);
  });
});

it("deduplicates existing recipient rows without aborting the enclosing transaction", async () => {
  await notifyTriggeredAlertDelivered({
    payload: payload(),
    projectInternalId: projectId,
    triggeredAlertId: alerts[0].id,
  });
  const existing = await rows();
  await (await claim("single")).finalize();
  expect(await rows()).toEqual(existing);
  expect(await shared.db.triggeredAlert.findUnique({ where: { id: alerts[0].id } })).toMatchObject({
    deliveryState: "delivered",
  });
});
