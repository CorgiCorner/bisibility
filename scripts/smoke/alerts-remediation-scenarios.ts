import assert from "node:assert/strict";
import { finalizeAlertDigestDeliveryActivity } from "@/lib/alerts/digest-delivery";
import { flushAlertDigests } from "@/lib/alerts/digest";
import type { AlertDigestJob } from "@/lib/alerts/digest-types";
import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "@/lib/alerts/limits";
import { notifyRankCheckCompleted } from "@/lib/notifications/events";
import { alertDeliveryWorkflowId } from "@/lib/temporal/alert-delivery-client";
import { makePublicId } from "@/lib/db/public-id";
import {
  type AcceptanceFixture,
  createKeyword,
  persistAcceptanceCheck,
  prisma,
} from "./alerts-remediation-fixture";

type QueueCapture = { alertIds: string[][]; digestJobs: AlertDigestJob[]; overflowNotices: number };

export function queueCapture(): QueueCapture {
  return { alertIds: [], digestJobs: [], overflowNotices: 0 };
}

const instant = (offsetMinutes: number) =>
  new Date(Date.UTC(2026, 6, 21, 12, offsetMinutes, 0, 0));

export async function runDigestScenario(fixture: AcceptanceFixture, capture: QueueCapture) {
  const rule = await prisma.alertRule.create({
    data: {
      channels: ["email"],
      conditionType: "position_drop",
      createdById: fixture.owner.id,
      dropPositions: 5,
      id: `${fixture.prefix}-rule-digest`,
      name: `${fixture.prefix}-digest`,
      projectId: fixture.project.id,
      publicId: makePublicId("alr"),
      severity: "warning",
      targetType: "all",
    },
  });
  const matchCount = MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY + 1;
  for (let index = 0; index < matchCount; index += 1) {
    const keyword = await createKeyword(fixture, `digest-${index}`);
    await persistAcceptanceCheck(
      fixture,
      {
        checkedAt: instant(index),
        keyword,
        position: 30,
        previousPosition: 1,
        rankingUrl: `https://${fixture.project.domain}/target`,
        trigger: "scheduled",
      },
      {
        enqueueDeliveries: async (alertIds) => {
          capture.alertIds.push(alertIds);
        },
      },
    );
  }

  const result = await flushAlertDigests(instant(30), {
    enqueueDigestJob: async (job) => {
      capture.digestJobs.push(job);
    },
    sendOverflowNotice: async () => {
      capture.overflowNotices += 1;
    },
  });
  const job = capture.digestJobs[0];
  assert(job);
  assert.deepEqual(result, {
    alertsQueued: matchCount,
    alertsSuppressed: 0,
    digestsQueued: 1,
    groupsFailed: 0,
  });
  assert.equal(capture.alertIds.length, 0, "scheduled alerts must not enqueue immediate sends");
  assert.equal(capture.digestJobs.length, 1, "one digest handoff per rule");
  assert.match(job.email.text, /\+1 more/);
  assert.doesNotMatch(job.email.text, /daily cap/);
  await finalizeAlertDigestDeliveryActivity({
    job,
    outcomes: [{ channel: "email", delivered: true }],
  });

  const [alerts, attempts, stat] = await Promise.all([
    prisma.triggeredAlert.findMany({
      select: { deliveryState: true, id: true },
      where: { ruleId: rule.id },
    }),
    prisma.deliveryAttempt.findMany({ where: { triggeredAlert: { ruleId: rule.id } } }),
    prisma.alertRuleDailyStat.findUnique({
      where: { ruleId_day: { day: new Date("2026-07-21T00:00:00.000Z"), ruleId: rule.id } },
    }),
  ]);
  assert.equal(alerts.length, matchCount);
  assert.equal(alerts.filter(({ deliveryState }) => deliveryState === "suppressed").length, 0);
  assert.equal(alerts.filter(({ deliveryState }) => deliveryState === "digested").length, matchCount);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.channel, "email");
  assert.equal(stat?.sentCount, 1);
  assert.equal(stat?.suppressedCount, 0);
  assert.equal(capture.overflowNotices, 0, "budget remains available");
  await prisma.alertRule.update({ data: { enabled: false }, where: { id: rule.id } });
  console.log("digest: one handoff, one email delivery record, visible item summary, 0 suppressed rows, 0 per-alert sends");
}

export async function runRetryScenario(fixture: AcceptanceFixture) {
  const keyword = await createKeyword(fixture, "retry");
  const rule = await prisma.alertRule.create({
    data: {
      channels: ["email"],
      conditionType: "position_drop",
      dropPositions: 5,
      id: `${fixture.prefix}-rule-retry`,
      name: `${fixture.prefix}-retry`,
      projectId: fixture.project.id,
      publicId: makePublicId("alr"),
      severity: "warning",
      targetType: "all",
    },
  });
  const handoffs: string[][] = [];
  const rankCheckId = `${fixture.prefix}-rank-retry`;
  const input = {
    checkedAt: instant(40),
    keyword,
    position: 20,
    previousPosition: 1,
    rankCheckId,
    rankingUrl: `https://${fixture.project.domain}/target`,
    trigger: "manual" as const,
  };
  await persistAcceptanceCheck(fixture, input, {
    enqueueDeliveries: async (alertIds) => {
      handoffs.push(alertIds);
    },
  });
  await persistAcceptanceCheck(fixture, input, {
    enqueueDeliveries: async (alertIds) => {
      handoffs.push(alertIds);
    },
  });
  const alerts = await prisma.triggeredAlert.findMany({ where: { ruleId: rule.id } });
  assert.equal(alerts.length, 1);
  assert.deepEqual(handoffs, [[alerts[0]?.id]]);
  const alertId = assertString(alerts[0]?.id);
  const workflowId = alertDeliveryWorkflowId(alertId);
  assert.equal(workflowId, `alert-delivery-${alertId}`);
  await prisma.alertRule.update({ data: { enabled: false }, where: { id: rule.id } });
  console.log(`retry: 1 TriggeredAlert, 1 handoff, stable workflow ${workflowId}`);
}

export async function runStatefulScenario(fixture: AcceptanceFixture) {
  const keyword = await createKeyword(fixture, "stateful");
  const rule = await prisma.alertRule.create({
    data: {
      channels: ["email"],
      conditionType: "url_mismatch",
      id: `${fixture.prefix}-rule-stateful`,
      name: `${fixture.prefix}-stateful`,
      projectId: fixture.project.id,
      publicId: makePublicId("alr"),
      severity: "urgent",
      targetType: "all",
    },
  });
  const handoffs: string[][] = [];
  const queue = {
    enqueueDeliveries: async (ids: string[]) => {
      handoffs.push(ids);
    },
  };
  const mismatched = `https://${fixture.project.domain}/wrong`;
  const matching = keyword.targetUrl;
  const states: string[] = [];
  for (const [index, rankingUrl] of [mismatched, mismatched, matching, mismatched].entries()) {
    await persistAcceptanceCheck(
      fixture,
      {
        checkedAt: instant(50 + index),
        keyword,
        position: 5,
        previousPosition: 5,
        previousRankingUrl: index === 0 ? matching : mismatched,
        rankingUrl,
        trigger: "manual",
      },
      queue,
    );
    const rows = await prisma.triggeredAlert.findMany({
      orderBy: { firedAt: "asc" },
      where: { ruleId: rule.id },
    });
    states.push(
      `${rows.filter(({ status }) => status === "resolved").length}r/${rows.filter(({ status }) => status !== "resolved").length}o/${handoffs.length}d`,
    );
    if (index === 2) assert(rows[0]?.resolvedAt);
  }
  assert.deepEqual(states, ["0r/1o/1d", "0r/1o/1d", "1r/0o/1d", "1r/1o/2d"]);
  console.log("stateful: 1 open -> 1 open -> 1 resolved -> 1 resolved + 1 open; deliveries 1 -> 1 -> 1 -> 2");
}

export async function runNotificationScenario(fixture: AcceptanceFixture) {
  const keyword = await createKeyword(fixture, "notification");
  await prisma.notification.deleteMany({
    where: { projectId: fixture.project.id, type: "check_complete" },
  });
  const rankCheckId = `${fixture.prefix}-notification-rank`;
  const base = {
    checkedAt: instant(60),
    keywordId: keyword.id,
    position: 4,
    projectId: fixture.project.id,
    rankCheckId,
  };
  await notifyRankCheckCompleted({ ...base, previousPosition: 4 });
  assert.equal(await checkNotificationCount(fixture), 0);
  await notifyRankCheckCompleted({ ...base, previousPosition: 5 });
  assert.equal(await checkNotificationCount(fixture), 2);
  await Promise.all(
    Array.from({ length: 8 }, () => notifyRankCheckCompleted({ ...base, previousPosition: 5 })),
  );
  const rows = await prisma.notification.findMany({
    select: { idempotencyKey: true, userId: true },
    where: { projectId: fixture.project.id, type: "check_complete" },
  });
  const expectedKey = `rank-check:${rankCheckId}:complete`;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    new Set(rows.map(({ userId }) => userId)),
    new Set([fixture.owner.id, fixture.optedIn.id]),
  );
  assert(rows.every(({ idempotencyKey }) => idempotencyKey === expectedKey));
  assert(!rows.some(({ userId }) => userId === fixture.optedOut.id));
  console.log(`notifications: unchanged 0, changed 2 opted-in, replay 2, idempotencyKey ${expectedKey}`);
}

async function checkNotificationCount(fixture: AcceptanceFixture) {
  return prisma.notification.count({
    where: { projectId: fixture.project.id, type: "check_complete" },
  });
}

function assertString(value: string | undefined): string {
  assert(value);
  return value;
}
