import {
  ProviderRateLimitedError,
  type ProviderRateLimitScope,
} from "@/lib/providers/rate-limit-error";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncPresenceForAllProjects, syncPresenceForProject } from "./sync";
import { configurePresenceDatabase } from "./sync-database.test-support";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn() },
    project: { findFirst: vi.fn(), findMany: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    urlPresence: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    urlPresenceChange: { create: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  provider: { createUrlInspectionSession: vi.fn(), inspectUrl: vi.fn() },
  notify: vi.fn(),
  reserveInspections: vi.fn(),
  releaseInspections: vi.fn(),
}));
vi.mock("./daily-summary", () => ({ persistIndexingDay: vi.fn() }));
vi.mock("./sitemap-snapshot", () => ({ persistSitemapSnapshot: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/analytics/gsc", () => ({ gscAnalyticsProvider: mocks.provider }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: vi.fn() }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ apiKey: "token", login: "sc-domain:example.com" }),
}));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: vi.fn() }));
vi.mock("./inspection-budget", async (original) => ({
  ...(await original<typeof import("./inspection-budget")>()),
  reserveInspections: mocks.reserveInspections,
  releaseInspections: mocks.releaseInspections,
}));
vi.mock("./property-quota", async (original) => ({
  ...(await original<typeof import("./property-quota")>()),
  startPropertyInspection: vi.fn(),
  recordProperty429: vi.fn(),
}));
vi.mock("./ops", () => ({ notifyPresenceBudgetExhausted: mocks.notify }));

const now = new Date("2026-11-01T12:00:00Z");
const urls = ["https://example.com/a", "https://example.com/b", "https://example.com/c"];
const inspection = { verdict: "PASS", coverageState: "Indexed" };
const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
const options = { sleep, clock: () => now.getTime() };

function limited(scope: ProviderRateLimitScope, retryAfterMs?: number) {
  return new ProviderRateLimitedError("gsc", {
    scope,
    source: "provider",
    resetAt: 0,
    retryAfterMs,
  });
}

const run = () => syncPresenceForProject("project_1", now, mocks.provider, options);

describe("presence quota handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sleep.mockResolvedValue(undefined);
    mocks.prisma.project.findFirst.mockResolvedValue({ id: "project_1", defaults: null });
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      id: "connection_1",
      credentialsEncrypted: "encrypted",
    });
    mocks.prisma.keyword.findMany.mockResolvedValue(urls.map((targetUrl) => ({ targetUrl })));
    mocks.prisma.urlPresence.findMany.mockResolvedValue([]);
    configurePresenceDatabase(mocks.prisma);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.reserveInspections.mockImplementation(async ({ urls: admitted }) => ({
      admitted,
      targetId: "prj_a00000000000000000000000",
    }));
    mocks.provider.createUrlInspectionSession.mockResolvedValue({
      inspectUrl: mocks.provider.inspectUrl,
    });
    mocks.provider.inspectUrl.mockResolvedValue(inspection);
  });

  it("waits for RetryInfo and checks every selected URL, retrying the same URL", async () => {
    mocks.provider.inspectUrl.mockRejectedValueOnce(limited("minute", 17_000));
    await expect(run()).resolves.toMatchObject({
      checked: 3,
      deferred: 0,
      deferredReason: null,
      failed: 0,
      resetAt: null,
    });
    expect(sleep.mock.calls).toEqual([[17_000]]);
    expect(mocks.releaseInspections).toHaveBeenCalledWith(expect.objectContaining({ released: 0 }));
    expect(mocks.reserveInspections).toHaveBeenCalledTimes(1);
    expect(mocks.provider.inspectUrl.mock.calls.map(([input]) => input.url)).toEqual([
      urls[0],
      ...urls,
    ]);
    expect(mocks.prisma.urlPresence.upsert).toHaveBeenCalledTimes(3);
    expect(mocks.provider.createUrlInspectionSession).toHaveBeenCalledTimes(1);
  });

  it("uses a minute default and caps total waits at two minutes", async () => {
    mocks.provider.inspectUrl.mockRejectedValue(limited("minute"));
    await expect(run()).resolves.toMatchObject({
      checked: 0,
      deferred: 3,
      deferredReason: "minute_rate_limit",
    });
    expect(sleep.mock.calls).toEqual([[60_000], [60_000]]);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(3);
  });

  it("caps wait count even when the provider delay is tiny", async () => {
    mocks.provider.inspectUrl.mockRejectedValue(limited("minute", 1));
    await expect(run()).resolves.toMatchObject({
      deferred: 3,
      deferredReason: "minute_rate_limit",
    });
    expect(sleep.mock.calls).toEqual([[1], [1], [1], [1]]);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(5);
  });

  it("shares the wait budget across URLs instead of resetting it on success", async () => {
    mocks.provider.inspectUrl
      .mockRejectedValueOnce(limited("minute"))
      .mockResolvedValueOnce(inspection)
      .mockRejectedValueOnce(limited("minute"))
      .mockResolvedValueOnce(inspection)
      .mockRejectedValueOnce(limited("minute"));
    await expect(run()).resolves.toMatchObject({
      checked: 2,
      deferred: 1,
      deferredReason: "minute_rate_limit",
    });
    expect(sleep.mock.calls).toEqual([[60_000], [60_000]]);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(5);
  });

  it("does not retry earlier when RetryInfo exceeds the remaining budget", async () => {
    mocks.provider.inspectUrl.mockRejectedValue(limited("minute", 120_001));
    await expect(run()).resolves.toMatchObject({
      deferred: 3,
      deferredReason: "minute_rate_limit",
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  });

  it("waits through the shared cooldown as well as the provider delay", async () => {
    mocks.provider.inspectUrl.mockRejectedValueOnce(
      new ProviderRateLimitedError("gsc", {
        source: "provider",
        scope: "minute",
        retryAfterMs: 1_500,
        resetAt: now.getTime() + 5_000,
      }),
    );
    await expect(run()).resolves.toMatchObject({ checked: 3, deferred: 0 });
    expect(sleep.mock.calls).toEqual([[5_000]]);
  });

  it("stops on daily quota and returns the next Pacific midnight without sleeping", async () => {
    mocks.provider.inspectUrl.mockRejectedValueOnce(limited("daily", 17_000));
    await expect(run()).resolves.toMatchObject({
      checked: 0,
      deferred: 3,
      deferredReason: "daily_budget",
      resetAt: new Date("2026-11-02T08:00:00Z"),
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  });

  it("backs off unknown quotas three times and stops without claiming daily exhaustion", async () => {
    mocks.provider.inspectUrl.mockRejectedValue(limited("unknown", 1_500));
    await expect(run()).resolves.toMatchObject({
      checked: 0,
      deferred: 3,
      deferredReason: "unknown_rate_limit",
      resetAt: null,
    });
    expect(sleep.mock.calls).toEqual([[5_000], [10_000], [20_000]]);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(4);
  });

  it("grows unknown backoff from the provider delay when it exceeds the default", async () => {
    mocks.provider.inspectUrl.mockRejectedValue(limited("unknown", 17_000));
    await expect(run()).resolves.toMatchObject({ deferredReason: "unknown_rate_limit" });
    expect(sleep.mock.calls).toEqual([[17_000], [34_000], [68_000]]);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(4);
  });

  it("continues the batch after an unknown quota recovers", async () => {
    mocks.provider.inspectUrl.mockRejectedValueOnce(limited("unknown"));
    await expect(run()).resolves.toMatchObject({ checked: 3, deferred: 0, deferredReason: null });
    expect(sleep.mock.calls).toEqual([[5_000]]);
  });

  it("bounds unknown backoff by total waiting too", async () => {
    mocks.provider.inspectUrl.mockRejectedValue(limited("unknown", 65_000));
    await expect(run()).resolves.toMatchObject({ deferredReason: "unknown_rate_limit" });
    expect(sleep.mock.calls).toEqual([[65_000]]);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(2);
  });

  it("keeps local rejections as immediate minute deferrals", async () => {
    mocks.provider.inspectUrl.mockRejectedValueOnce(new ProviderRateLimitedError("gsc"));
    await expect(run()).resolves.toMatchObject({
      deferred: 3,
      deferredReason: "minute_rate_limit",
      resetAt: null,
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  });

  it("does not send daily-budget notifications for exhausted unknown backoff", async () => {
    mocks.provider.inspectUrl.mockRejectedValue(limited("unknown"));
    await expect(syncPresenceForAllProjects(now, options)).resolves.toMatchObject({
      checked: 0,
      deferred: 3,
      failed: 0,
    });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it.each(["minute", "unknown"] as const)(
    "caps %s waits across projects and leaves standalone calls independent",
    async (scope) => {
      const projects = Array.from({ length: 7 }, (_, i) => ({ id: `project_${i}` }));
      mocks.prisma.project.findMany.mockResolvedValue(projects);
      mocks.prisma.project.findFirst.mockImplementation(({ where }) =>
        Promise.resolve({ id: where.OR[0].id, defaults: null }),
      );
      mocks.provider.inspectUrl.mockRejectedValue(
        limited(scope, scope === "minute" ? 60_000 : 40_000),
      );

      await expect(syncPresenceForAllProjects(now, options)).resolves.toMatchObject({
        checked: 0,
        deferred: 21,
        failed: 0,
        projects: 7,
      });
      expect(sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBe(600_000);
      expect(sleep).toHaveBeenCalledTimes(10);
      expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(17);
      expect(mocks.notify).not.toHaveBeenCalled();

      sleep.mockClear();
      await expect(run()).resolves.toMatchObject({
        deferred: 3,
        deferredReason: scope === "minute" ? "minute_rate_limit" : "unknown_rate_limit",
        resetAt: null,
      });
      expect(sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBe(120_000);
      expect(sleep).toHaveBeenCalledTimes(2);

      sleep.mockClear();
      await syncPresenceForAllProjects(now, options);
      expect(sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBe(600_000);
    },
  );

  it("defers when a provider delay exceeds the remaining run budget without shortening it", async () => {
    mocks.prisma.project.findMany.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({ id: `project_${i}` })),
    );
    mocks.prisma.project.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.OR[0].id, defaults: null }),
    );
    mocks.provider.inspectUrl.mockRejectedValue(limited("minute", 110_000));

    await expect(syncPresenceForAllProjects(now, options)).resolves.toMatchObject({
      checked: 0,
      deferred: 21,
      failed: 0,
      projects: 7,
    });
    expect(sleep.mock.calls).toEqual(Array.from({ length: 5 }, () => [110_000]));
    expect(sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBeLessThanOrEqual(600_000);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(12);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
