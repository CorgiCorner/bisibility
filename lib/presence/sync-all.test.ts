import "./sync.test-support";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncPresenceForAllProjects, syncPresenceForProject } from "./sync";
import { mocks } from "./sync.test-support";
import { configurePresenceDatabase } from "./sync-database.test-support";

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
    vi.resetAllMocks();
    mocks.getInspectionBudget.mockResolvedValue({ remaining: 50 });
    mocks.reserveInspections.mockImplementation(async ({ urls }) => ({
      admitted: urls.slice(0, (await mocks.getInspectionBudget()).remaining),
      targetId: "prj_a00000000000000000000000",
    }));
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
    configurePresenceDatabase(mocks.prisma, mocks.tx);
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
    expect(mocks.releaseInspections).toHaveBeenCalledWith(expect.objectContaining({ released: 1 }));
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
    mocks.getInspectionBudget.mockResolvedValue({ remaining: 2 });
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
        deferred: 2,
        failed: 0,
        projects: 2,
      });
      expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(4);
    } finally {
      if (previous === undefined) delete process.env[legacyKey];
      else process.env[legacyKey] = previous;
    }
  });

  it("shares daily exhaustion across grants and keeps a different property eligible", async () => {
    const projects = ["project_1", "project_2", "project_3"];
    mocks.prisma.project.findMany.mockResolvedValue(projects.map((id) => ({ id })));
    mocks.prisma.project.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ defaults: { inspectionDailyLimit: 2 }, id: where.OR[0].id }),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { targetUrl: "https://example.com/a" },
      { targetUrl: "https://example.com/b" },
    ]);
    const credentials = (apiKey: string) => ({ apiKey, login: "sc-domain:example.com" });
    mocks.decryptProviderCredentials
      .mockReturnValueOnce(credentials("first_grant"))
      .mockReturnValueOnce(credentials("second_grant"))
      .mockReturnValueOnce({ apiKey: "third_grant", login: "https://example.com/" });
    mocks.provider.inspectUrl.mockRejectedValueOnce(
      new ProviderRateLimitedError("gsc", { scope: "daily", source: "provider" }),
    );

    await expect(syncPresenceForAllProjects(now)).resolves.toMatchObject({
      checked: 2,
      deferred: 4,
      failed: 0,
      projects: 3,
    });
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(3);
    expect(mocks.provider.createUrlInspectionSession).toHaveBeenCalledTimes(2);
    expect(mocks.notifyPresenceBudgetExhausted).toHaveBeenCalledTimes(1);
    expect(mocks.notifyPresenceBudgetExhausted).toHaveBeenCalledWith({
      deferred: 4,
      projectIds: ["project_1", "project_2"],
      property: "sc-domain:example.com",
      propertyAccountKey: expect.stringMatching(/^gsc:/),
      resetAt: new Date("2026-07-04T07:00:00Z"),
    });

    // A later run starts with fresh daily state.
    await expect(syncPresenceForAllProjects(now)).resolves.toMatchObject({
      checked: 6,
      deferred: 0,
    });
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(9);
    expect(mocks.notifyPresenceBudgetExhausted).toHaveBeenCalledTimes(1);
  });

  it("returns the same daily reset for projects sharing run state", async () => {
    mocks.prisma.project.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ defaults: null, id: where.OR[0].id }),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/page" }]);
    mocks.provider.inspectUrl.mockRejectedValueOnce(
      new ProviderRateLimitedError("gsc", { scope: "daily", source: "provider" }),
    );
    const options = { dailyExhaustions: new Map<string, Date>() };
    const first = await syncPresenceForProject("project_1", now, mocks.provider, options);
    const second = await syncPresenceForProject("project_2", now, mocks.provider, options);
    for (const result of [first, second]) {
      expect(result).toMatchObject({
        status: "checked",
        checked: 0,
        deferred: 1,
        deferredReason: "daily_budget",
        failed: 0,
        resetAt: new Date("2026-07-04T07:00:00Z"),
      });
    }
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
    expect(mocks.provider.createUrlInspectionSession).toHaveBeenCalledTimes(1);
    // Standalone calls do not inherit the all-project run state.
    await expect(syncPresenceForProject("project_2", now)).resolves.toMatchObject({ checked: 1 });
  });

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

    await expect(
      syncPresenceForAllProjects(now, { sleep: vi.fn().mockResolvedValue(undefined) }),
    ).resolves.toMatchObject({
      checked: 2,
      deferred: 0,
      failed: 0,
      projects: 2,
    });

    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(3);
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
  it("does not notify ops for project allowance exhaustion alone", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }]);
    mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/a" }]);
    mocks.getInspectionBudget.mockResolvedValue({ remaining: 0 });
    await expect(syncPresenceForAllProjects(now)).resolves.toMatchObject({
      deferred: 1,
      checked: 0,
    });
    expect(mocks.notifyPresenceBudgetExhausted).not.toHaveBeenCalled();
    expect(mocks.provider.inspectUrl).not.toHaveBeenCalled();
  });
});
