import "server-only";

import { prisma } from "@/lib/db/prisma";

export type AlertHealthConfig = {
  failureRateThreshold: number;
  minAttempts: number;
  spikeMin: number;
  spikeMultiplier: number;
  windowHours: number;
};

function positive(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAlertHealthConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AlertHealthConfig {
  return {
    failureRateThreshold: positive(env.ALERT_DELIVERY_FAILURE_RATE_THRESHOLD, 0.25),
    minAttempts: positive(env.ALERT_DELIVERY_MIN_ATTEMPTS, 10),
    spikeMin: positive(env.ALERT_FIRE_SPIKE_MIN, 20),
    spikeMultiplier: positive(env.ALERT_FIRE_SPIKE_MULTIPLIER, 3),
    windowHours: positive(env.ALERT_DELIVERY_WINDOW_HOURS, 24),
  };
}

function groupedCount(value: number | { _all: number }) {
  return typeof value === "number" ? value : value._all;
}

export async function collectAlertDeliveryHealth(now: Date, config: AlertHealthConfig) {
  const rows = await prisma.deliveryAttempt.groupBy({
    _count: { _all: true },
    by: ["channel", "status"],
    where: {
      attemptedAt: { gte: new Date(now.getTime() - config.windowHours * 60 * 60 * 1000) },
    },
  });
  const perChannel: Record<
    string,
    { failed: number; sent: number; skipped: number; total: number }
  > = {};
  let failed = 0;
  let total = 0;
  for (const row of rows) {
    const count = groupedCount(row._count);
    if (!perChannel[row.channel]) {
      perChannel[row.channel] = { failed: 0, sent: 0, skipped: 0, total: 0 };
    }
    const channel = perChannel[row.channel];
    if (row.status === "failed") {
      channel.failed += count;
      channel.total += count;
      failed += count;
      total += count;
    } else if (row.status === "sent") {
      channel.sent += count;
      channel.total += count;
      total += count;
    } else if (row.status === "skipped") {
      channel.skipped += count;
    }
  }
  const failureRate = total > 0 ? failed / total : 0;
  return {
    alarm: total >= config.minAttempts && failureRate >= config.failureRateThreshold,
    failed,
    failureRate,
    perChannel,
    total,
    windowHours: config.windowHours,
  };
}

export async function collectAlertFireSpikes(now: Date, config: AlertHealthConfig) {
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const trailingStart = new Date(todayStart.getTime() - 7 * 86_400_000);
  const [todayRows, trailingRows] = await Promise.all([
    prisma.triggeredAlert.groupBy({
      _count: { _all: true },
      by: ["ruleId"],
      where: { firedAt: { gte: todayStart } },
    }),
    prisma.triggeredAlert.groupBy({
      _count: { _all: true },
      by: ["ruleId"],
      where: { firedAt: { gte: trailingStart, lt: todayStart } },
    }),
  ]);
  const trailing = new Map(trailingRows.map((row) => [row.ruleId, groupedCount(row._count) / 7]));
  const spikes = todayRows
    .map((row) => ({
      ruleId: row.ruleId,
      today: groupedCount(row._count),
      trailingDailyAvg: trailing.get(row.ruleId) ?? 0,
    }))
    .filter(
      ({ today, trailingDailyAvg }) =>
        today >= config.spikeMin && today > config.spikeMultiplier * trailingDailyAvg,
    )
    .sort((a, b) => b.today - a.today)
    .slice(0, 10);
  if (spikes.length === 0) return [];
  const rules = await prisma.alertRule.findMany({
    select: { id: true, name: true, projectId: true },
    where: { id: { in: spikes.map(({ ruleId }) => ruleId) } },
  });
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  return spikes.flatMap((spike) => {
    const rule = ruleById.get(spike.ruleId);
    return rule ? [{ ...spike, projectId: rule.projectId, ruleName: rule.name }] : [];
  });
}
