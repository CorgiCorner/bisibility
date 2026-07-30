import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProviderRateLimitState,
  consumeInspectionDailyBudget,
  consumeProviderLimit,
  drainInspectionDailyBudget,
  inspectionDailyBudgetLimit,
  isProviderRateLimitDisabled,
  ProviderRateLimitedError,
  peekProviderLimit,
  providerAccountKey,
  providerRateLimitPolicy,
  readCooldown,
  writeCooldown,
} from "./rate-limit";

const OVERRIDE_ENVS = [
  "BISIBILITY_PROVIDER_RATE_LIMIT_DATAFORSEO_PER_MINUTE",
  "BISIBILITY_PROVIDER_RATE_LIMIT_DATAFORSEO_WINDOW_SECONDS",
  "BISIBILITY_PROVIDER_RATE_LIMIT_PLAUSIBLE_PER_MINUTE",
  "BISIBILITY_PROVIDER_RATE_LIMIT_SERPAPI_PER_MINUTE",
  "BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED",
  "BISIBILITY_GSC_INSPECTION_DAILY_BUDGET",
];

describe("provider rate limit", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    clearProviderRateLimitState();
    process.env.REDIS_URL = "";
    for (const name of OVERRIDE_ENVS) {
      process.env[name] = "";
    }
  });

  it("exposes default policies pinned to quota shapes with a fallback", () => {
    expect(providerRateLimitPolicy("dataforseo")).toEqual({ perMinute: 1800, windowSeconds: 60 });
    expect(providerRateLimitPolicy("gsc")).toEqual({ perMinute: 600, windowSeconds: 60 });
    expect(providerRateLimitPolicy("plausible")).toEqual({ perMinute: 10, windowSeconds: 60 });
    expect(providerRateLimitPolicy("serpapi")).toEqual({ perMinute: 60, windowSeconds: 60 });
    expect(providerRateLimitPolicy("ga4")).toEqual({ perMinute: 60, windowSeconds: 60 });
    expect(providerRateLimitPolicy("unknown")).toEqual({ perMinute: 600, windowSeconds: 60 });
  });

  it("applies env overrides for per-minute and window", () => {
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DATAFORSEO_PER_MINUTE = "42";
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DATAFORSEO_WINDOW_SECONDS = "30";
    expect(providerRateLimitPolicy("dataforseo")).toEqual({ perMinute: 42, windowSeconds: 30 });
  });

  it("derives hashed, non-secret account keys per provider", () => {
    const dfs = providerAccountKey("dataforseo", { login: "acme-login", password: "secret" });
    expect(dfs).toMatch(/^dataforseo:[0-9a-f]{16}$/);
    expect(dfs).not.toContain("acme-login");

    const serp = providerAccountKey("serpapi", { apiKey: "super-secret-key" });
    expect(serp).toMatch(/^serpapi:[0-9a-f]{16}$/);
    expect(serp).not.toContain("super-secret-key");

    const gsc = providerAccountKey("gsc", { apiKey: "refresh", login: "sc-domain:example.com" });
    expect(gsc).toMatch(/^gsc:[0-9a-f]{16}:[0-9a-f]{16}$/);
    expect(gsc).not.toContain("refresh");

    const plausible = providerAccountKey("plausible", {
      apiKey: "stats-token",
      endpoint: "https://stats.example.com",
      login: "example.com",
    });
    expect(plausible).toMatch(/^plausible:[0-9a-f]{16}:[0-9a-f]{16}:[0-9a-f]{16}$/);
    expect(plausible).not.toContain("stats-token");
    expect(plausible).not.toContain("example.com");
  });

  it("falls back to a per-project key when no account id is derivable", () => {
    expect(providerAccountKey("dataforseo", {}, { projectId: "p1" })).toBe("dataforseo:project:p1");
    expect(providerAccountKey("serpapi", undefined)).toBe("serpapi:project:unknown");
  });

  it("consumes tokens over the memory store and reports exhaustion", async () => {
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_SERPAPI_PER_MINUTE = "2";
    const creds = { apiKey: "k1" };

    const first = await consumeProviderLimit("serpapi", creds);
    const second = await consumeProviderLimit("serpapi", creds);
    const third = await consumeProviderLimit("serpapi", creds);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(false);
    expect(third.remaining).toBe(0);
    expect(first.accountKey).toBe(second.accountKey);
  });

  it("peeks remaining without consuming a token", async () => {
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_SERPAPI_PER_MINUTE = "2";
    const creds = { apiKey: "k2" };

    const peeked = await peekProviderLimit("serpapi", creds);
    expect(peeked.remaining).toBe(2);

    await consumeProviderLimit("serpapi", creds);
    const afterConsume = await peekProviderLimit("serpapi", creds);
    expect(afterConsume.remaining).toBe(1);
  });

  it("shares the URL inspection daily budget across projects on one property", async () => {
    process.env.BISIBILITY_GSC_INSPECTION_DAILY_BUDGET = "2";
    const creds = { apiKey: "refresh", login: "sc-domain:example.com" };

    const first = await consumeInspectionDailyBudget(creds, { projectId: "project_1" });
    const second = await consumeInspectionDailyBudget(creds, { projectId: "project_2" });
    const exhausted = await consumeInspectionDailyBudget(creds, { projectId: "project_2" });

    expect(inspectionDailyBudgetLimit()).toBe(2);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(exhausted).toMatchObject({ remaining: 0, success: false });
    expect(first.accountKey).toBe(second.accountKey);
  });

  it("drains URL inspection calls for the rest of the daily window", async () => {
    const creds = { apiKey: "refresh-drain", login: "sc-domain:example.com" };

    await drainInspectionDailyBudget(creds);

    await expect(consumeInspectionDailyBudget(creds)).resolves.toMatchObject({
      remaining: 0,
      success: false,
    });
  });

  it("resets URL inspection budgets at midnight UTC instead of after a rolling 24 hours", async () => {
    vi.useFakeTimers();
    process.env.BISIBILITY_GSC_INSPECTION_DAILY_BUDGET = "1";
    const creds = { apiKey: "refresh-midnight", login: "sc-domain:example.com" };
    const beforeMidnight = new Date("2026-07-18T23:59:00.000Z");
    const afterMidnight = new Date("2026-07-19T00:00:00.000Z");
    vi.setSystemTime(beforeMidnight);

    const consumed = await consumeInspectionDailyBudget(creds);
    const exhausted = await consumeInspectionDailyBudget(creds);
    vi.setSystemTime(afterMidnight);
    const nextDay = await consumeInspectionDailyBudget(creds);

    expect(consumed.resetAt).toBe(afterMidnight.getTime());
    expect(exhausted).toMatchObject({ resetAt: afterMidnight.getTime(), success: false });
    expect(nextDay.success).toBe(true);
    expect(nextDay.resetAt).toBe(new Date("2026-07-20T00:00:00.000Z").getTime());
    vi.useRealTimers();
  });

  it("does not carry a drained inspection budget into the next UTC day", async () => {
    const creds = { apiKey: "refresh-drain-midnight", login: "sc-domain:example.com" };
    const dayN = new Date("2026-07-18T03:46:00.000Z");
    const dayNPlusOne = new Date("2026-07-19T03:45:00.000Z");

    await drainInspectionDailyBudget(creds, { now: dayN });

    await expect(consumeInspectionDailyBudget(creds, { now: dayN })).resolves.toMatchObject({
      success: false,
    });
    await expect(consumeInspectionDailyBudget(creds, { now: dayNPlusOne })).resolves.toMatchObject({
      success: true,
    });
  });

  it("backs off a cooling account: cooldown blocks consume and peek", async () => {
    const creds = { apiKey: "k3" };
    const accountKey = providerAccountKey("serpapi", creds);
    const until = writeCooldown(accountKey);
    expect(until).toBeGreaterThan(Date.now());
    expect(readCooldown(accountKey)?.until).toBe(until);

    const consumed = await consumeProviderLimit("serpapi", creds);
    expect(consumed.success).toBe(false);
    expect(consumed.cooling).toBe(true);

    const peeked = await peekProviderLimit("serpapi", creds);
    expect(peeked.cooling).toBe(true);
    expect(peeked.remaining).toBe(0);
  });

  it("grows the cooldown window exponentially on repeats", () => {
    const now = Date.now();
    const first = writeCooldown("acct", now);
    const second = writeCooldown("acct", now);
    expect(second - now).toBeGreaterThan(first - now);
  });

  it("bypasses limiting when the kill switch is set", async () => {
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED = "1";
    expect(isProviderRateLimitDisabled()).toBe(true);
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_SERPAPI_PER_MINUTE = "1";

    const first = await consumeProviderLimit("serpapi", { apiKey: "k4" });
    const second = await consumeProviderLimit("serpapi", { apiKey: "k4" });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.remaining).toBe(Number.POSITIVE_INFINITY);

    const inspectionCreds = { apiKey: "inspection-kill-switch" };
    await drainInspectionDailyBudget(inspectionCreds);
    const inspection = await consumeInspectionDailyBudget(inspectionCreds);
    expect(inspection.success).toBe(true);
    expect(inspection.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("ProviderRateLimitedError reports a retry-after derived from resetAt", () => {
    const error = new ProviderRateLimitedError("gsc", { resetAt: Date.now() + 30_000 });
    expect(error.name).toBe("ProviderRateLimitedError");
    expect(error.retryAfterSeconds()).toBeGreaterThan(0);
    expect(error.retryAfterSeconds()).toBeLessThanOrEqual(30);
  });
});
