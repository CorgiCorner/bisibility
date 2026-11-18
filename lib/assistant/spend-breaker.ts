import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notifyOps } from "@/lib/ops/notify";
import type { Clock } from "@usagekit/store";
import {
  type AssistantGuardConfig,
  centsToMicroUsd,
  readAssistantGuardConfig,
} from "./guard-config";
import { hostedSpendMicroUsd, unsettledHostedAttempts } from "./hosted-spend";
import { HOSTED_OFF_LEVEL, raiseKillSwitch, readAssistantKillSwitch } from "./kill-switch";

/**
 * Automatic breaker on platform-wide hosted spend, run by the metering maintenance every minute.
 * When the last hour's or the last day's hosted spend (settled plus open reservations) reaches its
 * cap, or too many hosted attempts sit unsettled or unknown (we may be paying the provider without
 * charging anyone), it sets the kill switch to "hosted_off": Credits turns stop, your-key turns keep
 * working. It audits the trip and alerts operations. Only an instance admin resets it, by setting
 * the switch back to "on"; the windows then restart at that reset, so a reset is not undone by
 * the same spend a minute later.
 */
export const ASSISTANT_BREAKER_RESET_SETTING = "assistant.breaker.resetAt";
const HOUR_MS = 60 * 60000;
const DAY_MS = 24 * HOUR_MS;

export type BreakerReading = { hourlyMicro: bigint; dailyMicro: bigint; unsettled: number };
export type BreakerTrip = {
  reason: "hourly_spend" | "daily_spend" | "unsettled_attempts";
  threshold: number;
};

/** The first cap the reading reaches, or null when every one has room. */
export function breakerTrip(
  reading: BreakerReading,
  config: AssistantGuardConfig,
): BreakerTrip | null {
  const hourly = config["assistant.guard.platformHourlyCents"];
  if (reading.hourlyMicro >= centsToMicroUsd(hourly))
    return { reason: "hourly_spend", threshold: hourly };
  const daily = config["assistant.guard.platformDailyCents"];
  if (reading.dailyMicro >= centsToMicroUsd(daily))
    return { reason: "daily_spend", threshold: daily };
  const unsettled = config["assistant.guard.unsettledAttempts"];
  if (reading.unsettled >= unsettled) return { reason: "unsettled_attempts", threshold: unsettled };
  return null;
}

const microToCents = (micro: bigint) => Number(micro / 10000n);

function windowStart(now: Date, span: number, resetAt: Date | null) {
  const start = new Date(now.getTime() - span);
  return resetAt && resetAt > start && resetAt <= now ? resetAt : start;
}

async function readResetAt(tx: Prisma.TransactionClient) {
  const row = await tx.instanceSetting.findUnique({
    select: { value: true },
    where: { key: ASSISTANT_BREAKER_RESET_SETTING },
  });
  const parsed = row ? new Date(row.value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

type Options = {
  clock?: Clock;
  transaction?: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  notify?: typeof notifyOps;
};

export async function runAssistantSpendBreaker(options: Options = {}) {
  const now = options.clock?.now() ?? new Date();
  const transaction =
    options.transaction ??
    (<T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
      prisma.$transaction(body, { timeout: 30000, maxWait: 10000 }));
  const outcome = await transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended('assistant-spend-breaker',0))`;
    // Already paused (by an admin or an earlier trip): nothing to do until someone resets it.
    if ((await readAssistantKillSwitch(tx)) !== "on") return null;
    const config = await readAssistantGuardConfig(tx);
    const resetAt = await readResetAt(tx);
    const daySince = windowStart(now, DAY_MS, resetAt);
    const reading: BreakerReading = {
      hourlyMicro: await hostedSpendMicroUsd(tx, { since: windowStart(now, HOUR_MS, resetAt) }),
      dailyMicro: await hostedSpendMicroUsd(tx, { since: daySince }),
      unsettled: await unsettledHostedAttempts(tx, { since: daySince, now }),
    };
    const trip = breakerTrip(reading, config);
    if (!trip) return null;
    const figures = {
      hourlyCents: microToCents(reading.hourlyMicro),
      dailyCents: microToCents(reading.dailyMicro),
      unsettledAttempts: reading.unsettled,
    };
    // Raises only: a level an admin set higher in the meantime is never lowered here.
    const raised = await raiseKillSwitch(tx, HOSTED_OFF_LEVEL, {
      action: "assistant.spend_breaker.tripped",
      actorId: null,
      after: { reason: trip.reason, threshold: trip.threshold, ...figures },
    });
    if (!raised.changed) return null;
    return { ...trip, ...figures };
  });
  if (!outcome) return { tripped: null };
  const notify = options.notify ?? notifyOps;
  try {
    await notify({
      dedupeKey: `assistant_spend_breaker:${now.toISOString().slice(0, 13)}`,
      kind: "assistant_spend_breaker_tripped",
      severity: "error",
      title: "Assistant Credits paused by the spend breaker",
      fields: {
        Reason: outcome.reason,
        Threshold: String(outcome.threshold),
        "Hourly hosted spend (cents)": String(outcome.hourlyCents),
        "Daily hosted spend (cents)": String(outcome.dailyCents),
        "Unsettled attempts": String(outcome.unsettledAttempts),
        Reset: "An instance admin sets the assistant kill switch back to off.",
      },
    });
  } catch {
    // The switch is already set and audited; a lost alert must not undo or repeat the trip.
    console.error("[assistant] spend breaker alert failed");
  }
  return { tripped: outcome };
}
