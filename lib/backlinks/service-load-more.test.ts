import { beforeEach, describe, expect, it, vi } from "vitest";
import { BacklinksSnapshotExpiredError, loadMoreBacklinkRows } from "./service";

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  paidCall: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    backlinkSnapshot: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  tx: {
    backlinkRow: { createMany: vi.fn() },
    backlinkSnapshot: { update: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.getProvider }));
vi.mock("@/lib/provider-lookups/paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-lookups/paid-call")>()),
  paidProviderCall: mocks.paidCall,
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
const row = {
  anchor: "Acme",
  domainAuthority: 91,
  firstSeen: "2026-01-21",
  flags: ["ugc" as const],
  linksCount: 2,
  lostAt: null,
  sourceDomain: "forum.example.org",
  sourceUrl: "https://forum.example.org/post",
  spamScore: 1,
  status: "active" as const,
  targetUrl: "https://acme-store.com/",
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
};
const snapshot = {
  costCents: 5,
  expiresAt: new Date("2026-07-25T12:00:00.000Z"),
  fetchedAt: new Date("2026-07-24T12:00:00.000Z"),
  fetchedRowCount: 100,
  history: [{ lostLinks: 8, month: "2026-06", newLinks: 22 }],
  id: "snapshot_1",
  includeSubdomains: true,
  projectId: "project_1",
  publicId: "bls_1",
  rows: [],
  summary: { ...summary, _mode: "one_per_domain", _provider: "dataforseo" },
  target: "acme-store.com",
  targetScope: "site",
  totalRowsAvailable: 1685,
};

function run() {
  return loadMoreBacklinkRows(
    { projectId: "prj_1" },
    {
      includeSubdomains: true,
      limit: 100,
      target: "acme-store.com",
      targetScope: "site",
    },
  );
}

describe("backlinks load-more service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T15:00:00.000Z"));
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(snapshot);
    mocks.getProvider.mockReturnValue(provider);
    mocks.paidCall.mockImplementation(
      ({ call }: { call: (credentials: object) => Promise<unknown> }) => call({}),
    );
    provider.fetchBacklinksRows.mockResolvedValue({ costCents: 1, rows: [row], totalCount: 1685 });
    mocks.prisma.$transaction.mockImplementation(
      (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.backlinkRow.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.backlinkSnapshot.update.mockResolvedValue({
      ...snapshot,
      costCents: 6,
      fetchedRowCount: 101,
    });
  });

  it("raises snapshot_expired when no unexpired snapshot exists", async () => {
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(null);
    await expect(run()).rejects.toBeInstanceOf(BacklinksSnapshotExpiredError);
    await expect(run()).rejects.toMatchObject({ code: "snapshot_expired" });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("appends rows at the fetched offset and charges only the rows rate", async () => {
    await expect(run()).resolves.toMatchObject({
      costCents: 6,
      fetchedRowCount: 101,
      ok: true,
      rows: [{ sourceDomain: "forum.example.org" }],
    });
    expect(provider.fetchBacklinksRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 100, mode: "one_per_domain", offset: 100 }),
    );
    expect(mocks.paidCall).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "backlinks", itemCount: 100 }),
    );
    expect(mocks.tx.backlinkRow.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ snapshotId: "snapshot_1" })] }),
    );
    expect(mocks.tx.backlinkSnapshot.update).toHaveBeenCalledWith({
      data: { costCents: { increment: 1 }, fetchedRowCount: { increment: 1 } },
      where: { id: "snapshot_1" },
    });
  });
});
