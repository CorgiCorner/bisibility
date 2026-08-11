import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncPresenceForAllProjects, syncPresenceForProject } from "./sync";

const mocks = vi.hoisted(() => {
  const tx = { urlPresence: { upsert: vi.fn() } };
  return {
    decryptProviderCredentials: vi.fn(),
    emitSignal: vi.fn(),
    markProviderNeedsReauth: vi.fn(),
    notifyPresenceBudgetExhausted: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      keyword: { findMany: vi.fn() },
      project: { findFirst: vi.fn(), findMany: vi.fn() },
      providerConnection: { findFirst: vi.fn() },
      urlPresence: { findMany: vi.fn(), upsert: vi.fn() },
    },
    provider: { createUrlInspectionSession: vi.fn(), inspectUrl: vi.fn() },
    tx,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/analytics/gsc", () => ({ gscAnalyticsProvider: mocks.provider }));
vi.mock("@/lib/providers/auth-state", () => ({
  markProviderNeedsReauth: mocks.markProviderNeedsReauth,
}));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: mocks.decryptProviderCredentials,
}));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));
vi.mock("./ops", () => ({
  notifyPresenceBudgetExhausted: mocks.notifyPresenceBudgetExhausted,
}));

const now = new Date("2026-07-04T03:45:00.000Z");
const legacyKey = ["BISIBILITY", "GSC", "INSPECTION", "DAILY", "BUDGET"].join("_");

function inspection(verdict: string) {
  return {
    coverageState: "Submitted and indexed",
    googleCanonical: "https://example.com/page",
    lastCrawlAt: new Date("2026-07-01T10:15:00.000Z"),
    userCanonical: "https://example.com/page",
    verdict,
  };
}

describe("presence sync across projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = "";
    mocks.decryptProviderCredentials.mockReturnValue({
      apiKey: "refresh_token",
      login: "sc-domain:example.com",
    });
    mocks.emitSignal.mockResolvedValue({ id: "signal_1" });
    mocks.markProviderNeedsReauth.mockResolvedValue(true);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.prisma.project.findFirst.mockResolvedValue({ defaults: null, id: "project_1" });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      credentialsEncrypted: "encrypted",
      id: "connection_1",
    });
    mocks.prisma.urlPresence.findMany.mockResolvedValue([]);
    mocks.provider.inspectUrl.mockResolvedValue(inspection("PASS"));
    mocks.provider.createUrlInspectionSession.mockResolvedValue({
      inspectUrl: mocks.provider.inspectUrl,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("marks broken Google authorization once and skips the connection on the next run", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { targetUrl: "https://example.com/a" },
      { targetUrl: "https://example.com/b" },
    ]);
    mocks.provider.inspectUrl.mockRejectedValueOnce(new ProviderAuthError("gsc"));

    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      attempted: 2,
      checked: 0,
      deferred: 1,
      deferredReason: "authorization",
      failed: 1,
    });
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
    expect(mocks.markProviderNeedsReauth).toHaveBeenCalledWith({
      connectionId: "connection_1",
      projectId: "project_1",
      provider: "gsc",
    });

    mocks.prisma.providerConnection.findFirst.mockResolvedValueOnce(null);
    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      reason: "no_connection",
      status: "skipped",
    });
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  });

  it("propagates deferred URL counts through the all-project summary", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }]);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { targetUrl: "https://example.com/a" },
      { targetUrl: "https://example.com/b" },
    ]);
    mocks.provider.inspectUrl.mockRejectedValueOnce(new ProviderRateLimitedError("gsc"));

    await expect(syncPresenceForAllProjects(now)).resolves.toMatchObject({
      checked: 0,
      deferred: 2,
      failed: 0,
      projects: 1,
    });

    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  });

  it("keeps project limits independent when the deprecated instance value is set", async () => {
    const previous = process.env[legacyKey];
    process.env[legacyKey] = "1";
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }, { id: "project_2" }]);
    mocks.prisma.project.findFirst.mockImplementation(({ where }) => {
      const id = where.OR[0].id;
      return Promise.resolve({ defaults: { inspectionDailyLimit: 2 }, id });
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { targetUrl: "https://example.com/a" },
      { targetUrl: "https://example.com/b" },
      { targetUrl: "https://example.com/c" },
    ]);

    try {
      await expect(syncPresenceForAllProjects(now)).resolves.toMatchObject({
        checked: 4,
        deferred: 0,
        failed: 0,
        projects: 2,
      });
      expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(4);
    } finally {
      if (previous === undefined) delete process.env[legacyKey];
      else process.env[legacyKey] = previous;
    }
  });

  it.each(["daily", "unknown"] as const)(
    "reports a %s-scope provider 429 without changing another project's limit",
    async (scope) => {
      mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }, { id: "project_2" }]);
      mocks.prisma.project.findFirst.mockImplementation(({ where }) => {
        const id = where.OR[0].id;
        return Promise.resolve({ defaults: { inspectionDailyLimit: 50 }, id });
      });
      mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/page" }]);
      mocks.provider.inspectUrl.mockRejectedValueOnce(
        new ProviderRateLimitedError("gsc", { scope, source: "provider" }),
      );

      await expect(syncPresenceForAllProjects(now)).resolves.toMatchObject({
        checked: 1,
        deferred: 1,
        failed: 0,
        projects: 2,
      });

      expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(2);
      expect(mocks.notifyPresenceBudgetExhausted).toHaveBeenCalledWith({
        deferred: 1,
        projectIds: ["project_1"],
        property: "sc-domain:example.com",
        propertyAccountKey: expect.stringMatching(/^gsc:/),
      });
    },
  );

  it("keeps another project eligible after a minute-scope provider 429", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }, { id: "project_2" }]);
    mocks.prisma.project.findFirst.mockImplementation(({ where }) => {
      const id = where.OR[0].id;
      return Promise.resolve({ defaults: { inspectionDailyLimit: 50 }, id });
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/page" }]);
    mocks.provider.inspectUrl
      .mockRejectedValueOnce(
        new ProviderRateLimitedError("gsc", { scope: "minute", source: "provider" }),
      )
      .mockResolvedValueOnce(inspection("PASS"));

    await expect(syncPresenceForAllProjects(now)).resolves.toMatchObject({
      checked: 1,
      deferred: 1,
      failed: 0,
      projects: 2,
    });

    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(2);
    expect(mocks.notifyPresenceBudgetExhausted).not.toHaveBeenCalled();
  });

  it("swallows per-project errors during all-project sync", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }, { id: "project_2" }]);
    mocks.prisma.project.findFirst
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ id: "project_2" });
    mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/page" }]);

    await expect(syncPresenceForAllProjects(now)).resolves.toMatchObject({
      checked: 1,
      failed: 1,
      projects: 2,
    });

    expect(consoleError).toHaveBeenCalledWith("[presence] project sync failed", {
      error: expect.any(Error),
      projectId: "project_1",
    });
  });
});
