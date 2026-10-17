import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redisList: vi.fn(),
  redisDelete: vi.fn(),
  copies: vi.fn(),
  back: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  domain: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  reports: { findMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    backlinkSnapshot: mocks.back,
    domainOverviewSnapshot: mocks.domain,
    agentReport: mocks.reports,
  },
}));
vi.mock("./redis-store", () => ({
  listRedisDataCache: mocks.redisList,
  removeRedisDataCache: mocks.redisDelete,
  removeStoredRedisCopies: mocks.copies,
}));

import { listProjectDataCache, removeProjectDataCache } from "./store";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redisList.mockResolvedValue({ entries: [], cursor: "0", available: true });
  mocks.back.findMany.mockResolvedValue([]);
  mocks.domain.findMany.mockResolvedValue([]);
  mocks.reports.findMany.mockResolvedValue([]);
  mocks.copies.mockResolvedValue("removed");
});
it("moves through durable caches when Redis has no entries and retains paging", async () => {
  mocks.back.findMany.mockResolvedValue([
    {
      id: "cacheA",
      target: "example.com",
      targetScope: "site",
      summary: { _provider: "dataforseo" },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    },
  ]);
  const first = await listProjectDataCache("projectA", "0", 3600, { dataforseo: "DataForSEO" });
  expect(first.entries[0]).toMatchObject({
    module: "backlinks",
    provider: "DataForSEO",
    keyword: "example.com",
    token: "dbb:cacheA",
  });
  mocks.domain.findMany.mockResolvedValue([
    {
      id: "domainA",
      target: "example.org",
      provider: "dataforseo",
      locationCode: 2616,
      languageCode: "pl",
      fetchedAt: new Date(),
      cachedUntil: new Date(Date.now() + 3600000),
    },
  ]);
  const second = await listProjectDataCache("projectA", first.cursor, 3600, {
    dataforseo: "DataForSEO",
  });
  expect(second.entries[0]).toMatchObject({ module: "domain_overview", keyword: "example.org" });
  expect(mocks.back.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ projectId: "projectA", fetchedAt: expect.any(Object) }),
    }),
  );
});
it("invalidates backlink reuse plus Redis copies while retaining history rows", async () => {
  const fetchedAt = new Date();
  mocks.back.findFirst.mockResolvedValue({
    id: "cacheA",
    target: "example.com",
    summary: { _provider: "dataforseo" },
    targetScope: "site",
    includeSubdomains: true,
    fetchedAt,
  });
  expect(await removeProjectDataCache("projectA", "dbb:cacheA")).toBe("removed");
  expect(mocks.copies).toHaveBeenCalledWith("projectA", {
    module: "backlinks",
    target: "example.com",
    provider: "dataforseo",
    scope: "site",
    includeSubdomains: true,
    mode: "as_is",
  });
  expect(mocks.back.updateMany).toHaveBeenCalledWith({
    where: { id: "cacheA", projectId: "projectA", fetchedAt },
    data: { expiresAt: new Date(0) },
  });
});
it("keeps a busy durable snapshot reusable until its paid refresh completes", async () => {
  mocks.back.findFirst.mockResolvedValue({
    id: "cacheA",
    target: "example.com",
    summary: {},
    fetchedAt: new Date(),
  });
  mocks.copies.mockResolvedValue("busy");
  expect(await removeProjectDataCache("projectA", "dbb:cacheA")).toBe("busy");
  expect(mocks.back.updateMany).not.toHaveBeenCalled();
});
it("does not touch another project's stored result or its copies", async () => {
  mocks.back.findFirst.mockResolvedValue(null);
  expect(await removeProjectDataCache("projectA", "dbb:foreignId")).toBe("invalid");
  expect(mocks.back.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "foreignId", projectId: "projectA" } }),
  );
  expect(mocks.copies).not.toHaveBeenCalled();
  expect(mocks.back.updateMany).not.toHaveBeenCalled();
});
it("clears only site-audit reuse and never removes the saved report", async () => {
  mocks.reports.updateMany.mockResolvedValue({ count: 1 });
  expect(await removeProjectDataCache("projectA", "dba:auditA")).toBe("removed");
  expect(mocks.reports.updateMany).toHaveBeenCalledWith({
    where: { id: "auditA", projectId: "projectA", kind: "site_audit" },
    data: { cacheReuseUntil: new Date(0) },
  });
});

it("shows the effective shorter expiry without extending the original cached result", async () => {
  const fetchedAt = new Date(Date.now() - 1800000);
  const effectiveExpiry = new Date(fetchedAt.getTime() + 3600000).toISOString();
  mocks.back.findMany.mockResolvedValue([
    {
      id: "cacheA",
      target: "example.com",
      targetScope: "site",
      summary: {},
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + 86400000),
    },
  ]);
  const first = await listProjectDataCache("projectA", "0", 3600);
  expect(first.entries[0].expiresAt).toBe(effectiveExpiry);
  mocks.domain.findMany.mockResolvedValue([
    {
      id: "domainA",
      target: "example.org",
      provider: "dataforseo",
      locationCode: 2616,
      languageCode: "pl",
      fetchedAt,
      cachedUntil: new Date(fetchedAt.getTime() + 86400000),
    },
  ]);
  const second = await listProjectDataCache("projectA", first.cursor, 3600);
  expect(second.entries[0].expiresAt).toBe(effectiveExpiry);
});

it("preserves Redis unavailability when continuing through durable entries", async () => {
  mocks.redisList.mockResolvedValue({ entries: [], cursor: "0", available: false });
  expect(await listProjectDataCache("projectA", "0", null)).toMatchObject({ available: false });
});
it("passes the exact stored domain market and scope to invalidation", async () => {
  const fetchedAt = new Date();
  mocks.domain.findFirst.mockResolvedValue({
    id: "domainA",
    target: "example.com",
    provider: "dataforseo",
    scope: "root",
    locationCode: 2616,
    languageCode: "pl",
    fetchedAt,
  });
  expect(await removeProjectDataCache("projectA", "dbd:domainA")).toBe("removed");
  expect(mocks.copies).toHaveBeenCalledWith("projectA", {
    module: "domain_overview",
    target: "example.com",
    provider: "dataforseo",
    scope: "root",
    locationCode: 2616,
    languageCode: "pl",
  });
  expect(mocks.domain.updateMany).toHaveBeenCalledWith({
    where: { id: "domainA", projectId: "projectA", fetchedAt },
    data: { cachedUntil: new Date(0) },
  });
});
