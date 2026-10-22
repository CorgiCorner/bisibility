import type { RankCheckConnectionInput } from "@/lib/rank-check/runner-input";

import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import type { SerpRankResult } from "@/lib/providers/types";
import type { RankCheckScheduleInput } from "@/lib/rank-check/schedule";

export const PROVIDER_NOT_CONNECTED_MESSAGE = "Connect a SERP provider before running rank checks.";

// Classify provider errors carrying HTTP 429 signals as cooldown deferrals, not
// generic provider failures.
export function isProviderThrottleError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return /\b429\b|too many requests|rate.?limit/.test(message);
}

export function fallbackSchedule(): RankCheckScheduleInput {
  return {
    cronExpression: null,
    frequency: "manual",
    jitterMinutes: 0,
    timezone: "UTC",
  };
}

export function credentialsFromConnection(connection: RankCheckConnectionInput) {
  if (connection.credentialSource === "hosted")
    throw new Error("Hosted rank checks require deployment execution credentials.");
  if (connection.credentials) {
    return connection.credentials;
  }

  return resolveProviderCredentials(connection.provider, connection.credentialsEncrypted);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function rankCheckRaw(rank: SerpRankResult, connectionId?: string) {
  if (!isRecord(rank.raw)) return null;
  const json = structuredClone(rank.raw) as unknown;
  if (isRecord(json) && isRecord(json.snapshotContinuation) && connectionId) {
    json.snapshotContinuation.connectionId = connectionId;
  }
  return isRecord(json) ? (json as Prisma.InputJsonObject) : null;
}
