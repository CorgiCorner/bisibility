import "./sync.test-support";

import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INSPECTION_DAILY_LIMIT } from "./constants";
import { syncPresenceForProject } from "./sync";
import { mocks } from "./sync.test-support";
import { configurePresenceDatabase } from "./sync-database.test-support";

const now = new Date("2026-07-04T03:45:00.000Z");

function inspection(verdict: string, coverageState = "Submitted and indexed") {
  return {
    coverageState,
    googleCanonical: "https://example.com/page",
    lastCrawlAt: new Date("2026-07-01T10:15:00.000Z"),
    userCanonical: "https://example.com/page",
    verdict,
  };
}

function presence(url: string, verdict: string, checkedAt = "2026-07-01T00:00:00.000Z") {
  return {
    canonicalOk: true,
    checkedAt: new Date(checkedAt),
    coverageState: "Submitted and indexed",
    lastCrawlAt: new Date("2026-07-01T10:15:00.000Z"),
    url,
    verdict,
  };
}

describe("presence sync", () => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores a first check without emitting a signal", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/page" }]);

    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      checked: 1,
      signals: 0,
      status: "checked",
    });

    expect(mocks.provider.createUrlInspectionSession).toHaveBeenCalledWith({
      apiKey: "refresh_token",
      login: "sc-domain:example.com",
    });
    expect(mocks.provider.inspectUrl).toHaveBeenCalledWith({
      property: "sc-domain:example.com",
      url: "https://example.com/page",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.prisma.urlPresence.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        checkedAt: now,
        projectId: "project_1",
        url: "https://example.com/page",
        verdict: "PASS",
      }),
      update: expect.objectContaining({ checkedAt: now, verdict: "PASS" }),
      where: { projectId_url: { projectId: "project_1", url: "https://example.com/page" } },
    });
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("emits signals only for indexed-state transitions", async () => {
    const urls = [
      "https://example.com/first",
      "https://example.com/deindexed",
      "https://example.com/indexed",
      "https://example.com/unchanged",
    ];
    mocks.prisma.keyword.findMany.mockResolvedValue(urls.map((targetUrl) => ({ targetUrl })));
    mocks.prisma.urlPresence.findMany.mockResolvedValue([
      presence(urls[1], "PASS"),
      presence(urls[2], "FAIL"),
      presence(urls[3], "FAIL"),
    ]);
    mocks.provider.inspectUrl.mockImplementation((input) => {
      const byUrl = {
        [urls[0]]: inspection("PASS"),
        [urls[1]]: inspection("FAIL", "Not indexed"),
        [urls[2]]: inspection("PASS"),
        [urls[3]]: inspection("NEUTRAL", "Excluded"),
      };
      return Promise.resolve(byUrl[input.url as keyof typeof byUrl]);
    });

    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      checked: 4,
      signals: 2,
    });

    expect(mocks.emitSignal).toHaveBeenCalledTimes(2);
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "warning",
        source: "url_inspection",
        type: "url.deindexed",
        url: "https://example.com/deindexed",
      }),
      mocks.tx,
    );
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        source: "url_inspection",
        type: "url.indexed",
        url: "https://example.com/indexed",
      }),
      mocks.tx,
    );
  });

  it("checks the default daily limit with never-checked URLs first, then oldest checked", async () => {
    const urls = Array.from(
      { length: DEFAULT_INSPECTION_DAILY_LIMIT + 5 },
      (_, index) => `https://example.com/page-${String(index).padStart(2, "0")}`,
    );
    mocks.prisma.keyword.findMany.mockResolvedValue(urls.map((targetUrl) => ({ targetUrl })));
    mocks.prisma.urlPresence.findMany.mockResolvedValue(
      urls
        .slice(0, -2)
        .map((url, index) =>
          presence(url, "PASS", `2026-07-01T00:${String(index).padStart(2, "0")}:00Z`),
        ),
    );

    await syncPresenceForProject("project_1", now);

    const calledUrls = mocks.provider.inspectUrl.mock.calls.map((call) => call[0].url);
    expect(calledUrls).toHaveLength(DEFAULT_INSPECTION_DAILY_LIMIT);
    expect(calledUrls.slice(0, 2)).toEqual([urls[53], urls[54]]);
    expect(calledUrls.slice(2)).toEqual(urls.slice(0, 48));
  });

  it("respects the per-project inspection limit", async () => {
    mocks.getInspectionBudget.mockResolvedValue({ remaining: 2 });
    mocks.prisma.project.findFirst.mockResolvedValue({
      defaults: { inspectionDailyLimit: 2 },
      id: "project_1",
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { targetUrl: "https://example.com/a" },
      { targetUrl: "https://example.com/b" },
      { targetUrl: "https://example.com/c" },
    ]);

    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      attempted: 2,
      checked: 2,
      deferred: 1,
      deferredReason: "project_allowance",
    });

    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(2);
    expect(mocks.provider.createUrlInspectionSession).toHaveBeenCalledTimes(1);
    expect(mocks.reserveInspections).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        projectId: "project_1",
        skipEmpty: true,
        urls: ["https://example.com/a", "https://example.com/b", "https://example.com/c"],
      }),
    );
    expect(mocks.reserveInspections).toHaveBeenCalledBefore(
      mocks.provider.createUrlInspectionSession,
    );
  });

  it("skips projects without a connected Search Console connection", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);

    await expect(syncPresenceForProject("project_1", now)).resolves.toEqual({
      projectId: "project_1",
      reason: "no_connection",
      status: "skipped",
    });

    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mocks.provider.inspectUrl).not.toHaveBeenCalled();
  });

  it("stops the batch and defers unchecked URLs when the provider rate limits", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { targetUrl: "https://example.com/a" },
      { targetUrl: "https://example.com/b" },
      { targetUrl: "https://example.com/c" },
    ]);
    mocks.provider.inspectUrl
      .mockResolvedValueOnce(inspection("PASS"))
      .mockRejectedValueOnce(new ProviderRateLimitedError("gsc"));

    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      attempted: 3,
      checked: 1,
      deferred: 2,
      deferredReason: "minute_rate_limit",
      failed: 0,
    });

    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.urlPresence.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.releaseInspections).toHaveBeenCalledWith(expect.objectContaining({ released: 1 }));
  });

  it("excludes today's results and selects only the remaining allowance", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { targetUrl: "https://example.com/a" },
      { targetUrl: "https://example.com/b" },
      { targetUrl: "https://example.com/c" },
    ]);
    mocks.prisma.urlPresence.findMany.mockResolvedValue([
      presence("https://example.com/a", "PASS", "2026-07-04T00:00:00Z"),
      presence("https://example.com/c", "PASS"),
    ]);
    mocks.getInspectionBudget.mockResolvedValue({ remaining: 1 });
    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      attempted: 1,
      checked: 1,
    });
    expect(mocks.provider.inspectUrl).toHaveBeenCalledExactlyOnceWith({
      property: "sc-domain:example.com",
      url: "https://example.com/b",
      signal: expect.any(AbortSignal),
    });
  });

  it("shares the daily allowance with manual inspections before any provider call", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/a" }]);
    mocks.getInspectionBudget.mockResolvedValue({ remaining: 0 });
    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      checked: 0,
      deferred: 1,
      deferredReason: "project_allowance",
    });
    expect(mocks.provider.createUrlInspectionSession).not.toHaveBeenCalled();
    expect(mocks.provider.inspectUrl).not.toHaveBeenCalled();
  });

  it("counts non-rate-limit inspection errors and continues", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { targetUrl: "https://example.com/a" },
      { targetUrl: "https://example.com/b" },
    ]);
    mocks.provider.inspectUrl
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(inspection("PASS"));

    await expect(syncPresenceForProject("project_1", now)).resolves.toMatchObject({
      checked: 1,
      deferred: 0,
      deferredReason: null,
      failed: 1,
    });

    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(2);
    expect(mocks.markProviderNeedsReauth).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[presence] url inspection failed", {
      error: expect.any(Error),
      projectId: "project_1",
      url: "https://example.com/a",
    });
  });
});
