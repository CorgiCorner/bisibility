import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Spending guards for the hosted Credits path. Each is an instance setting row, so an operator
 * changes it without a deploy; a missing or malformed row falls back to the conservative default
 * below. Spend amounts are the platform's provider cost in US cents (what the provider bills us),
 * counted as settled cost plus what open reservations may still cost.
 */
export const ASSISTANT_GUARD_DEFAULTS = {
  /** Platform-wide hosted spend in the last 60 minutes that trips the breaker. */
  "assistant.guard.platformHourlyCents": 2000,
  /** Platform-wide hosted spend in the last 24 hours that trips the breaker. */
  "assistant.guard.platformDailyCents": 10000,
  /** Hosted attempts dispatched or reserved but not settled after the grace time, or unknown. */
  "assistant.guard.unsettledAttempts": 25,
  /** Hosted spend of one project (team) since 00:00 UTC; new Credits steps stop at it. */
  "assistant.guard.teamDailyCents": 1000,
  /** Simultaneous Credits turns in one project (team). */
  "assistant.guard.teamConcurrentTurns": 2,
  /**
   * Operations are alerted when a provider-reported correction leaves a wallet more than this
   * many customer cents below zero. Nothing is capped: the data shows whether a cap is needed.
   */
  "assistant.guard.debtAlertCents": 100,
} as const;

export type AssistantGuardKey = keyof typeof ASSISTANT_GUARD_DEFAULTS;
export type AssistantGuardConfig = { -readonly [K in AssistantGuardKey]: number };

export const ASSISTANT_GUARD_KEYS = Object.keys(ASSISTANT_GUARD_DEFAULTS) as AssistantGuardKey[];

/** Every guard is a positive safe integer; anything else falls back to the default. */
export function parseAssistantGuardValue(value: string): number | null {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function isAssistantGuardKey(value: string): value is AssistantGuardKey {
  return Object.hasOwn(ASSISTANT_GUARD_DEFAULTS, value);
}

type SettingsClient = Pick<Prisma.TransactionClient, "instanceSetting">;

/** Read uncached: a lowered cap applies to the very next turn or step. */
export async function readAssistantGuardConfig(
  client: SettingsClient = prisma,
): Promise<AssistantGuardConfig> {
  const rows = await client.instanceSetting.findMany({
    select: { key: true, value: true },
    where: { key: { in: ASSISTANT_GUARD_KEYS } },
  });
  const config: AssistantGuardConfig = { ...ASSISTANT_GUARD_DEFAULTS };
  for (const row of rows) {
    if (!isAssistantGuardKey(row.key)) continue;
    config[row.key] = parseAssistantGuardValue(row.value) ?? config[row.key];
  }
  return config;
}

/** US cents to the micro-USD unit attempts are stored in. */
export function centsToMicroUsd(cents: number) {
  return BigInt(cents) * 10000n;
}
