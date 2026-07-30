// Worker-safe despite `server-only`: the marker is type-only and erased before the
// Temporal worker loads this module through runner.ts.
import "server-only";

import { createHash } from "node:crypto";
import { consume, envInt, type LimiterInput, peek } from "@/lib/api/ratelimit";
import type { ProviderCredentials } from "./types";

export { ProviderRateLimitedError } from "./rate-limit-error";

const PROVIDER_PREFIX = "bisibility:provider";
const INSPECTION_DAILY_WINDOW_SECONDS = 86_400;
const INSPECTION_DAILY_DEFAULT = 1_600;

// Provider 429 cooldowns back off exponentially and are globally consistent only
// with a Redis or Valkey limiter store.
const COOLDOWN_BASE_MS = 5_000;
const COOLDOWN_MAX_MS = 5 * 60_000;
const COOLDOWN_REPEAT_WINDOW_MS = 10 * 60_000;

export type ProviderPolicy = { perMinute: number; windowSeconds: number };

// Defaults stay below DataForSEO's 2,000/min and 30-concurrent quotas plus GSC's
// 1,200 QPM and 2,000/day inspection quotas; SerpAPI and GA4 use minute approximations.
const DEFAULT_POLICIES: Record<string, ProviderPolicy> = {
  dataforseo: { perMinute: 1800, windowSeconds: 60 },
  ga4: { perMinute: 60, windowSeconds: 60 },
  gsc: { perMinute: 600, windowSeconds: 60 },
  plausible: { perMinute: 10, windowSeconds: 60 },
  serpapi: { perMinute: 60, windowSeconds: 60 },
};

const FALLBACK_POLICY: ProviderPolicy = { perMinute: 600, windowSeconds: 60 };

function truthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.toLowerCase() ?? "");
}

export function isProviderRateLimitDisabled() {
  return truthy(process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED);
}

export function providerRateLimitPolicy(providerId: string): ProviderPolicy {
  const base = DEFAULT_POLICIES[providerId] ?? FALLBACK_POLICY;
  const key = providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return {
    perMinute: envInt(`BISIBILITY_PROVIDER_RATE_LIMIT_${key}_PER_MINUTE`, base.perMinute),
    windowSeconds: envInt(
      `BISIBILITY_PROVIDER_RATE_LIMIT_${key}_WINDOW_SECONDS`,
      base.windowSeconds,
    ),
  };
}

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function withoutTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

function projectFallback(providerId: string, projectId?: string) {
  return `${providerId}:project:${projectId ?? "unknown"}`;
}

function apiKeyAccountKey(providerId: string, apiKey: string | undefined, projectId?: string) {
  return apiKey ? `${providerId}:${sha(apiKey)}` : projectFallback(providerId, projectId);
}

function googleAccountKey(providerId: string, creds: ProviderCredentials, projectId?: string) {
  if (!creds.apiKey) return projectFallback(providerId, projectId);
  const property = creds.login ? `:${sha(creds.login)}` : "";
  return `${providerId}:${sha(creds.apiKey)}${property}`;
}

function plausibleAccountKey(creds: ProviderCredentials, projectId?: string) {
  if (!creds.apiKey) return projectFallback("plausible", projectId);
  const site = creds.login ? `:${sha(creds.login)}` : "";
  const normalizedEndpoint = creds.endpoint ? withoutTrailingSlashes(creds.endpoint) : undefined;
  const endpoint = normalizedEndpoint ? `:${sha(normalizedEndpoint)}` : "";
  return `plausible:${sha(creds.apiKey)}${site}${endpoint}`;
}

// Hash provider plus non-secret quota-owner identity for bucket keys; fall back
// to project scope when no account identity is available.
export function providerAccountKey(
  providerId: string,
  creds: ProviderCredentials | undefined,
  options?: { projectId?: string },
): string {
  const c = creds ?? {};
  switch (providerId) {
    case "dataforseo":
      return c.login
        ? `dataforseo:${sha(c.login)}`
        : projectFallback(providerId, options?.projectId);
    case "serpapi":
      return apiKeyAccountKey(providerId, c.apiKey, options?.projectId);
    case "gsc":
    case "ga4":
      return googleAccountKey(providerId, c, options?.projectId);
    case "plausible":
      return plausibleAccountKey(c, options?.projectId);
    default:
      return projectFallback(providerId, options?.projectId);
  }
}

type CooldownEntry = { until: number; repeats: number; writtenAt: number };
const cooldowns = new Map<string, CooldownEntry>();

export function readCooldown(accountKey: string): { until: number; repeats: number } | null {
  const entry = cooldowns.get(accountKey);
  if (!entry) {
    return null;
  }
  const now = Date.now();
  if (entry.until <= now && entry.writtenAt + COOLDOWN_REPEAT_WINDOW_MS <= now) {
    cooldowns.delete(accountKey);
    return null;
  }
  return { repeats: entry.repeats, until: entry.until };
}

export function writeCooldown(accountKey: string, now = Date.now()): number {
  const previous = cooldowns.get(accountKey);
  const repeats =
    previous && previous.writtenAt + COOLDOWN_REPEAT_WINDOW_MS > now ? previous.repeats + 1 : 1;
  const ttl = Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** (repeats - 1));
  const until = now + ttl;
  cooldowns.set(accountKey, { repeats, until, writtenAt: now });
  return until;
}

export function clearProviderRateLimitState() {
  cooldowns.clear();
}

export type ConsumeProviderResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
  accountKey: string;
  cooling: boolean;
};

function limiterInput(providerId: string, accountKey: string): LimiterInput {
  const policy = providerRateLimitPolicy(providerId);
  return {
    bucketKey: accountKey,
    limit: policy.perMinute,
    prefix: PROVIDER_PREFIX,
    windowSeconds: policy.windowSeconds,
  };
}

export function inspectionDailyBudgetLimit() {
  return envInt("BISIBILITY_GSC_INSPECTION_DAILY_BUDGET", INSPECTION_DAILY_DEFAULT);
}

function inspectionUtcDay(now: Date) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function nextUtcMidnight(now: Date) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function inspectionBudgetInput(accountKey: string, now: Date): LimiterInput {
  return {
    bucketKey: `inspection:${accountKey}:${inspectionUtcDay(now)}`,
    limit: inspectionDailyBudgetLimit(),
    prefix: PROVIDER_PREFIX,
    windowSeconds: INSPECTION_DAILY_WINDOW_SECONDS,
  };
}

function inspectionDrainInput(accountKey: string, now: Date): LimiterInput {
  return {
    bucketKey: `inspection-drained:${accountKey}:${inspectionUtcDay(now)}`,
    limit: 1,
    prefix: PROVIDER_PREFIX,
    windowSeconds: INSPECTION_DAILY_WINDOW_SECONDS,
  };
}

// Daily limits are global only with Redis or Valkey; in-memory state resets on restart.
// UTC resets precede Google's Pacific reset, so provider 429s backstop the gap; 24h is retention.
export async function consumeInspectionDailyBudget(
  creds: ProviderCredentials,
  options?: { now?: Date; projectId?: string },
): Promise<ConsumeProviderResult> {
  const accountKey = providerAccountKey("gsc", creds, options);
  const now = options?.now ?? new Date();
  const resetAt = nextUtcMidnight(now);
  if (isProviderRateLimitDisabled()) {
    return {
      accountKey,
      cooling: false,
      remaining: Number.POSITIVE_INFINITY,
      resetAt,
      success: true,
    };
  }
  const drained = await peek(inspectionDrainInput(accountKey, now));
  if (drained.remaining === 0) {
    return { accountKey, cooling: false, remaining: 0, resetAt, success: false };
  }
  const result = await consume(inspectionBudgetInput(accountKey, now));
  return { accountKey, cooling: false, ...result, resetAt };
}

export async function drainInspectionDailyBudget(
  creds: ProviderCredentials,
  options?: { now?: Date; projectId?: string },
) {
  const accountKey = providerAccountKey("gsc", creds, options);
  const now = options?.now ?? new Date();
  const resetAt = nextUtcMidnight(now);
  if (isProviderRateLimitDisabled()) {
    return { accountKey, resetAt, success: true };
  }
  const result = await consume(inspectionDrainInput(accountKey, now));
  return { accountKey, resetAt, success: result.success };
}

function resolveAccountKey(
  providerId: string,
  source: string | ProviderCredentials | undefined,
  options?: { projectId?: string; accountKey?: string },
) {
  if (options?.accountKey) {
    return options.accountKey;
  }
  if (typeof source === "string") {
    return source;
  }
  return providerAccountKey(providerId, source, options);
}

export async function consumeProviderLimit(
  providerId: string,
  creds: ProviderCredentials | undefined,
  options?: { projectId?: string; accountKey?: string },
): Promise<ConsumeProviderResult> {
  const accountKey = resolveAccountKey(providerId, creds, options);
  if (isProviderRateLimitDisabled()) {
    return {
      accountKey,
      cooling: false,
      remaining: Number.POSITIVE_INFINITY,
      resetAt: Date.now(),
      success: true,
    };
  }

  const cooldown = readCooldown(accountKey);
  if (cooldown && cooldown.until > Date.now()) {
    return { accountKey, cooling: true, remaining: 0, resetAt: cooldown.until, success: false };
  }

  const result = await consume(limiterInput(providerId, accountKey));
  return {
    accountKey,
    cooling: false,
    remaining: result.remaining,
    resetAt: result.resetAt,
    success: result.success,
  };
}

export async function peekProviderLimit(
  providerId: string,
  source: string | ProviderCredentials | undefined,
  options?: { projectId?: string },
): Promise<ConsumeProviderResult> {
  const accountKey = resolveAccountKey(providerId, source, options);
  if (isProviderRateLimitDisabled()) {
    return {
      accountKey,
      cooling: false,
      remaining: Number.POSITIVE_INFINITY,
      resetAt: Date.now(),
      success: true,
    };
  }

  const cooldown = readCooldown(accountKey);
  if (cooldown && cooldown.until > Date.now()) {
    return { accountKey, cooling: true, remaining: 0, resetAt: cooldown.until, success: false };
  }

  const result = await peek(limiterInput(providerId, accountKey));
  return {
    accountKey,
    cooling: false,
    remaining: result.remaining,
    resetAt: result.resetAt,
    success: result.remaining > 0,
  };
}
