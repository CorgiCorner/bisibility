import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  consume: vi.fn(),
  crawl: vi.fn(),
  authorize: vi.fn(),
  write: vi.fn(),
  policy: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/lib/agent-reports/service", () => ({
  createAgentReport: mocks.create,
  getAgentReport: mocks.get,
  listAgentReports: mocks.list,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUniqueOrThrow: mocks.policy },
    agentReport: {
      findMany: async () =>
        (await mocks.list()).map((row: { id: string; createdAt: string }) => ({
          publicId: row.id,
          createdAt: new Date(row.createdAt),
        })),
    },
  },
}));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/redis/redis", () => ({
  redisConfigured: () => false,
  getRedisClient: vi.fn(),
  resetRedisClientForTests: vi.fn(),
}));
vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/deployment/project-write-mode", () => ({ assertProjectWritable: mocks.write }));
vi.mock("@/lib/operations/access-extension", () => ({ assertOperationAccess: mocks.access }));
vi.mock("./crawl", () => ({ crawlSite: mocks.crawl }));

import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { AuditRateLimitError } from "./errors";
import { listSiteAudits, readSiteAudit, runSiteAudit } from "./service";

const context = {
  actor: { id: "user1", memberships: [{ projectId: "project1", role: "owner" as const }] },
  project: { id: "project1", domain: "example.com", writeMode: "active" },
};
const result = {
  version: 1,
  target: "https://example.com/",
  startedAt: "2026-10-02T10:00:00.000Z",
  completedAt: "2026-10-02T10:00:01.000Z",
  state: "complete",
  stopReason: "finished",
  limits: { maxPages: 10, maxRequests: 20, maxDurationMs: 15000, maxPageBytes: 524288 },
  requests: 1,
  pages: [],
  summary: { pages: 0, errors: 0, warnings: 0, indexable: 0 },
  limitations: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([]);
  mocks.policy.mockResolvedValue({ lookupCacheTtlSeconds: null });
  mocks.access.mockResolvedValue(undefined);
  mocks.consume.mockResolvedValue({ success: true });
  mocks.crawl.mockResolvedValue(result);
  mocks.create.mockResolvedValue({ id: "agr_result", createdAt: result.completedAt });
});
describe("site audit service", () => {
  it("authorizes and checks write mode before any cache or network work", async () => {
    mocks.authorize.mockImplementation(() => {
      throw new Error("forbidden");
    });
    await expect(runSiteAudit(context, {})).rejects.toThrow("forbidden");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.crawl).not.toHaveBeenCalled();
    mocks.authorize.mockReset();
    mocks.write.mockImplementation(() => {
      throw new Error("read only");
    });
    await expect(runSiteAudit(context, {})).rejects.toThrow("read only");
    expect(mocks.crawl).not.toHaveBeenCalled();
  });
  it.each([null, "", "   "])(
    "rejects missing project domain %j before cache or outbound work",
    async (domain) => {
      await expect(
        runSiteAudit({ ...context, project: { ...context.project, domain } }, {}),
      ).rejects.toThrow(/no domain/);
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(mocks.crawl).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed limits and arbitrary audit targets before I/O", async () => {
    for (const input of [
      { maxPages: 16 },
      { maxPages: 0 },
      { maxPages: 1.5 },
      { target: "http://127.0.0.1" },
    ])
      await expect(runSiteAudit(context, input)).rejects.toThrow();
    expect(mocks.crawl).not.toHaveBeenCalled();
  });
  it.each(["missing", "invalid", "different limits", "different target"])(
    "denies new crawls before rate limits, HTTP or report writes when the cache is %s",
    async (cache) => {
      const denial = new OperationAccessDeniedError();
      mocks.access.mockRejectedValue(denial);
      if (cache !== "missing") {
        mocks.list.mockResolvedValue([{ id: "agr_saved", createdAt: new Date().toISOString() }]);
        mocks.get.mockResolvedValue({
          kind: "site_audit",
          body:
            cache === "invalid"
              ? { version: 1 }
              : cache === "different target"
                ? { ...result, target: "https://example.org/" }
                : { ...result, limits: { ...result.limits, maxPages: 5 } },
        });
      }
      await expect(runSiteAudit(context, {})).rejects.toBe(denial);
      expect(mocks.access).toHaveBeenCalledExactlyOnceWith("project1");
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(mocks.crawl).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("reuses a matching cached report even when new operations would be denied", async () => {
    mocks.access.mockRejectedValue(new OperationAccessDeniedError());
    const createdAt = new Date().toISOString();
    mocks.list.mockResolvedValue([{ id: "agr_saved", createdAt }]);
    mocks.get.mockResolvedValue({ kind: "site_audit", body: result });
    await expect(runSiteAudit(context, {})).resolves.toMatchObject({
      id: "agr_saved",
      cached: true,
    });
    expect(mocks.get).toHaveBeenCalledWith({ projectId: "project1", reportId: "agr_saved" });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.crawl).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps report detail and history readable when new operations would be denied", async () => {
    mocks.access.mockRejectedValue(new OperationAccessDeniedError());
    mocks.get.mockResolvedValue({
      id: "agr_saved",
      createdAt: result.completedAt,
      kind: "site_audit",
      body: result,
    });
    const history = [{ id: "agr_saved", createdAt: result.completedAt }];
    mocks.list.mockResolvedValue(history);
    await expect(readSiteAudit("project1", "agr_saved")).resolves.toMatchObject({
      id: "agr_saved",
      cached: true,
      result,
    });
    await expect(listSiteAudits("project1")).resolves.toEqual(history);
    expect(mocks.list).toHaveBeenCalledWith({
      projectId: "project1",
      kind: "site_audit",
      limit: 30,
    });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.crawl).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("never treats an arbitrary agent report JSON body as a validated crawl", async () => {
    mocks.list.mockResolvedValue([{ id: "agr_saved", createdAt: new Date().toISOString() }]);
    mocks.get.mockResolvedValue({ kind: "site_audit", body: { version: 1 } });
    await expect(runSiteAudit(context, {})).resolves.toMatchObject({ cached: false });
    expect(mocks.crawl).toHaveBeenCalled();
    await expect(readSiteAudit("project1", "agr_saved")).resolves.toBeNull();
  });
  it("limits work per project and persists HTTP-only provenance", async () => {
    await expect(runSiteAudit(context, { maxPages: 10 })).resolves.toMatchObject({
      id: "agr_result",
      cached: false,
      result,
    });
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith("project1");
    expect(mocks.access.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.consume.mock.invocationCallOrder[0],
    );
    expect(mocks.crawl).toHaveBeenCalledExactlyOnceWith("example.com", 10);
    expect(mocks.consume).toHaveBeenCalledWith({
      prefix: "bisibility:site-audit",
      bucketKey: "project1",
      limit: 2,
      windowSeconds: 60,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project1",
        actorId: "user1",
        kind: "site_audit",
        body: result,
        provenance: expect.objectContaining({ source: "bounded_http_crawl", providerCostCents: 0 }),
      }),
    );
  });
  it("denies the third uncached run even when page limits vary and retries after expiry", async () => {
    const limiter =
      await vi.importActual<typeof import("@/lib/api/ratelimit")>("@/lib/api/ratelimit");
    limiter.resetRateLimitStateForTests();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    try {
      mocks.consume.mockImplementation(limiter.consume);
      await runSiteAudit(context, { maxPages: 1 });
      now.mockReturnValue(1_800_000_010_000);
      await runSiteAudit(context, { maxPages: 2 });
      await expect(runSiteAudit(context, { maxPages: 3 })).rejects.toMatchObject({
        name: "AuditRateLimitError",
        code: "site_audit_rate_limited",
        limit: 2,
        remaining: 0,
        resetAt: 1_800_000_060_000,
        retryAfterSeconds: 50,
      });
      expect(mocks.crawl).toHaveBeenCalledTimes(2);
      expect(mocks.create).toHaveBeenCalledTimes(2);
      now.mockReturnValue(1_800_000_060_001);
      await expect(runSiteAudit(context, { maxPages: 3 })).resolves.toMatchObject({
        cached: false,
      });
      expect(mocks.crawl).toHaveBeenCalledTimes(3);
      expect(new AuditRateLimitError(Date.now() - 1, 2, 0).retryAfterSeconds).toBe(1);
    } finally {
      now.mockRestore();
      limiter.resetRateLimitStateForTests();
    }
  });
  it("makes no network call when rate limits reject the request", async () => {
    mocks.consume.mockResolvedValue({
      success: false,
      limit: 2,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    await expect(runSiteAudit(context, {})).rejects.toThrow(/rate limit/);
    expect(mocks.crawl).not.toHaveBeenCalled();
  });
  it("keeps retrieval project-scoped and excludes other report kinds", async () => {
    mocks.get.mockResolvedValue({ kind: "analysis", body: result });
    await expect(readSiteAudit("project2", "agr_result")).resolves.toBeNull();
    expect(mocks.get).toHaveBeenCalledWith({ projectId: "project2", reportId: "agr_result" });
  });
});
