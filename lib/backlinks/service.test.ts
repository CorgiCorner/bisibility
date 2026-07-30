import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeBacklinks } from "./service";
import { UnsupportedBacklinksTargetError } from "./target";
import type { BacklinksRow } from "./types";

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  paidCall: vi.fn(),
  preflightBudget: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    backlinkSnapshot: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  tx: {
    backlinkSnapshot: { create: vi.fn() },
  },
  withCache: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.getProvider }));
vi.mock("@/lib/provider-lookups/paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-lookups/paid-call")>()),
  paidProviderCall: mocks.paidCall,
  preflightProviderBudget: mocks.preflightBudget,
}));
vi.mock("./cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cache")>()),
  withBacklinksCache: mocks.withCache,
}));

const summary = {
  backlinksTotal: 1685,
  brokenBacklinks: 0,
  brokenPages: 0,
  dofollowPct: 61,
  domainRank: 37,
  lostBacklinks: 12,
  lostReferringDomains: 1,
  newBacklinks: 34,
  newReferringDomains: 3,
  referringDomainsTotal: 48,
  referringPages: 1422,
  spamScore: 3,
};
const activeRow = {
  anchor: "Acme",
  domainAuthority: 91,
  firstSeen: "2026-01-21",
  flags: ["nofollow" as const, "ugc" as const],
  linksCount: 6,
  lostAt: null,
  sourceDomain: "reddit.com",
  sourceUrl: "https://reddit.com/r/seo",
  spamScore: 2,
  status: "new" as const,
  targetUrl: "https://acme-store.com/",
};
const recentLostRow = {
  ...activeRow,
  lostAt: "2026-07-01",
  sourceDomain: "recent.example.org",
  status: "lost" as const,
};
const oldLostRow = {
  ...activeRow,
  lostAt: "2026-01-01",
  sourceDomain: "old.example.org",
  status: "lost" as const,
};
const provider = {
  fetchBacklinksHistory: vi.fn(),
  fetchBacklinksRows: vi.fn(),
  fetchBacklinksSummary: vi.fn(),
  id: "dataforseo",
  label: "DataForSEO",
};
const project = {
  budgetCapCents: 5_000,
  id: "project_1",
  providerConnections: [
    { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
  ],
  publicId: "prj_1",
};

function testDate(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
}

function dbRow(
  row: Omit<BacklinksRow, "firstSeen" | "lostAt"> & {
    firstSeen: Date | string | null;
    lostAt: Date | string | null;
  },
  id: string,
) {
  return {
    ...row,
    firstSeen: testDate(row.firstSeen),
    id,
    lostAt: testDate(row.lostAt),
    snapshotId: "snapshot_1",
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    costCents: 5,
    expiresAt: new Date("2026-07-25T12:00:00.000Z"),
    fetchedAt: new Date("2026-07-24T12:00:00.000Z"),
    fetchedRowCount: 100,
    history: [{ lostLinks: 8, month: "2026-06", newLinks: 22 }],
    id: "snapshot_1",
    includeSubdomains: true,
    projectId: "project_1",
    publicId: "bls_1",
    rows: [dbRow(activeRow, "row_1")],
    summary: { ...summary, _mode: "as_is", _provider: "dataforseo" },
    target: "acme-store.com",
    targetScope: "site",
    totalRowsAvailable: 1685,
    ...overrides,
  };
}

function run(overrides: Record<string, unknown> = {}) {
  return analyzeBacklinks(
    { projectId: "prj_1" },
    { resultLimit: 100, target: "acme-store.com", ...overrides },
  );
}

describe("backlinks analyze service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T15:00:00.000Z"));
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(null);
    mocks.getProvider.mockReturnValue(provider);
    mocks.preflightBudget.mockResolvedValue(undefined);
    mocks.paidCall.mockImplementation(
      ({ call }: { call: (credentials: object) => Promise<unknown> }) => call({}),
    );
    mocks.withCache.mockImplementation(async ({ load }: { load: () => Promise<unknown> }) => ({
      cached: false,
      status: "success",
      value: await load(),
    }));
    provider.fetchBacklinksSummary.mockResolvedValue({ costCents: 2, summary });
    provider.fetchBacklinksHistory.mockResolvedValue({
      costCents: 2,
      rows: [{ lostLinks: 8, lostReferringDomains: 1, month: "2026-06", newLinks: 22 }],
    });
    provider.fetchBacklinksRows.mockResolvedValue({
      costCents: 1,
      rows: [activeRow],
      totalCount: 1685,
    });
    mocks.prisma.$transaction.mockImplementation(
      (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.backlinkSnapshot.create.mockImplementation(({ data }) =>
      Promise.resolve(
        snapshot({
          costCents: data.costCents,
          expiresAt: data.expiresAt,
          fetchedAt: data.fetchedAt,
          fetchedRowCount: data.fetchedRowCount,
          history: data.history,
          rows: data.rows.create.map((row: typeof activeRow, index: number) =>
            dbRow(row, `row_${index}`),
          ),
          summary: data.summary,
          totalRowsAvailable: data.totalRowsAvailable,
        }),
      ),
    );
  });

  it("returns an unexpired sufficiently large snapshot for free", async () => {
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(snapshot());
    await expect(run()).resolves.toMatchObject({
      cached: true,
      costCents: 0,
      fetchedRowCount: 100,
      ok: true,
      provider: "dataforseo",
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
    expect(provider.fetchBacklinksRows).not.toHaveBeenCalled();
  });

  it("returns a provider-rate estimate without any provider call", async () => {
    await expect(run({ estimateOnly: true })).resolves.toMatchObject({
      costCents: 5,
      estimate: true,
      estimatedCostCents: 5,
      history: [],
      ok: true,
      rows: [],
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("reports an unexpired snapshot as cached on the estimate path", async () => {
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(snapshot());
    await expect(run({ estimateOnly: true })).resolves.toMatchObject({
      cached: true,
      costCents: 0,
      estimate: true,
      estimatedCostCents: 5,
      fetchedRowCount: 0,
      history: [],
      ok: true,
      rows: [],
    });
    expect(mocks.prisma.backlinkSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { expiresAt: true, fetchedAt: true },
      }),
    );
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("selects the backlinks source by provider chain priority", async () => {
    await run({ estimateOnly: true, target: "example.com" });

    expect(mocks.prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          providerConnections: expect.objectContaining({
            orderBy: [{ priority: "asc" }, { provider: "asc" }],
            where: { enabled: true, kind: "serp", status: "connected" },
          }),
        }),
      }),
    );
  });

  it("skips history in a page-scope estimate", async () => {
    await expect(
      run({ estimateOnly: true, target: "https://acme-store.com/product", targetScope: "page" }),
    ).resolves.toMatchObject({ estimatedCostCents: 3, targetScope: "page" });
  });

  it("surfaces provider status and lost date without self-diffing", async () => {
    provider.fetchBacklinksRows.mockResolvedValue({
      costCents: 1,
      rows: [activeRow, recentLostRow],
      totalCount: 2,
    });
    await expect(run()).resolves.toMatchObject({
      rows: [
        { lostAt: null, status: "new" },
        { lostAt: "2026-07-01", status: "lost" },
      ],
    });
  });

  it("filters lost rows older than 90 days on reads", async () => {
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(
      snapshot({
        rows: [dbRow(activeRow, "1"), dbRow(recentLostRow, "2"), dbRow(oldLostRow, "3")],
      }),
    );
    const result = await run();
    expect(result.ok && result.rows.map((row) => row.sourceDomain)).toEqual([
      "reddit.com",
      "recent.example.org",
    ]);
  });

  it("propagates budget exhaustion", async () => {
    mocks.preflightBudget.mockRejectedValue(
      new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" }),
    );
    await expect(run()).resolves.toEqual({ ok: false, reason: "budget_exhausted" });
    expect(mocks.preflightBudget).toHaveBeenCalledWith({
      budgetCapCents: 5_000,
      estimatedCostCents: 5,
      projectId: "project_1",
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("fresh bypasses the DB snapshot and records a new one", async () => {
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(snapshot());
    await expect(run({ fresh: true })).resolves.toMatchObject({ cached: false, ok: true });
    expect(provider.fetchBacklinksRows).toHaveBeenCalledOnce();
    expect(mocks.tx.backlinkSnapshot.create).toHaveBeenCalledOnce();
  });

  it("rejects an invalid target locally without provider work", async () => {
    await expect(
      run({ target: "https://acme-store.com/product?q=1", targetScope: "page" }),
    ).rejects.toBeInstanceOf(UnsupportedBacklinksTargetError);
    expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("enforces max cost before any paid call", async () => {
    await expect(run({ maxCostCents: 4 })).resolves.toEqual({
      ok: false,
      reason: "cost_limit_exceeded",
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("accepts a zero max cost and rejects any paid call", async () => {
    await expect(run({ maxCostCents: 0 })).resolves.toEqual({
      ok: false,
      reason: "cost_limit_exceeded",
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("coalesces concurrent analyses into one provider flight", async () => {
    const flights = new Map<string, Promise<unknown>>();
    mocks.withCache.mockImplementation(({ key, load }) => {
      const existing = flights.get(key);
      if (existing) {
        return existing.then((value) => ({ cached: true, status: "success", value }));
      }
      const flight = Promise.resolve().then(load);
      flights.set(key, flight);
      return flight.then((value) => ({ cached: false, status: "success", value }));
    });

    const [first, second] = await Promise.all([run(), run()]);
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect(provider.fetchBacklinksSummary).toHaveBeenCalledOnce();
    expect(provider.fetchBacklinksHistory).toHaveBeenCalledOnce();
    expect(provider.fetchBacklinksRows).toHaveBeenCalledOnce();
  });
});
