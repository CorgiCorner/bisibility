import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { backlinksCacheKey } from "./cache";
import { analyzeBacklinks, loadMoreBacklinkRows } from "./service";
import { findBacklinksSnapshot, findCurrentBacklinksSnapshot } from "./snapshot";
import { backlinksSnapshotReference } from "./snapshot-reference";
import { findStoredBacklinks, snapshotProvider } from "./stored";

const mocks = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  backlinkSnapshot: { findFirst: vi.fn() },
  getProvider: vi.fn(),
  paid: vi.fn(),
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks }));
vi.mock("@/lib/redis/redis", () => ({ redisConfigured: () => false }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.getProvider }));
vi.mock("@/lib/provider-lookups/paid-call", () => ({
  ProviderLookupSignal: class extends Error {},
}));
vi.mock("./provider-call", () => ({
  BacklinksHistoryEvidenceError: class extends Error {},
  assertBacklinksMaxCost: vi.fn(),
  backlinksEstimate: () => ({ total: 5 }),
  fetchBacklinksAnalysis: mocks.paid,
  fetchMoreBacklinksRows: mocks.paid,
}));

const lookup = {
  includeSubdomains: true,
  minRows: 100,
  mode: "as_is" as const,
  now: new Date("2026-10-14T12:00:00Z"),
  projectId: "project_1",
  provider: "fixture_b",
  scope: "site" as const,
  target: "example.com",
};
const snapshot = {
  id: "snapshot_1",
  expiresAt: new Date("2026-10-15T12:00:00Z"),
  fetchedAt: lookup.now,
  fetchedRowCount: 100,
  history: [],
  includeSubdomains: true,
  projectId: lookup.projectId,
  rows: [],
  summary: { _mode: "as_is", _provider: "fixture_b" },
  target: lookup.target,
  targetScope: "site",
  totalRowsAvailable: 200,
};
const context = { origin: APP_REQUEST_ORIGIN, projectId: "prj_1" };

describe("backlinks provider isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backlinkSnapshot.findFirst.mockResolvedValue(snapshot);
    mocks.$queryRaw.mockResolvedValue([]);
    mocks.project.findFirst.mockResolvedValue({
      id: lookup.projectId,
      providerConnections: ["fixture_a", "fixture_b"].map((provider) => ({
        provider,
        id: `connection_${provider}`,
        credentialsEncrypted: "fixture",
      })),
    });
    mocks.getProvider.mockImplementation((id: string) => ({
      id,
      fetchBacklinksSummary: vi.fn(),
      fetchBacklinksHistory: vi.fn(),
      fetchBacklinksRows: vi.fn(),
    }));
  });

  it("uses distinct cache and contention keys for each source", () => {
    expect(backlinksCacheKey({ ...lookup, provider: "fixture_a" })).not.toBe(
      backlinksCacheKey(lookup),
    );
  });

  it.each([undefined, null, {}, { _provider: "" }, { _provider: 123 }])(
    "does not invent a provider for legacy metadata %j",
    (summary) => expect(snapshotProvider(summary)).toBe("unknown"),
  );

  it("preserves an explicitly recorded source without requiring a current adapter", () => {
    expect(snapshotProvider({ _provider: "fixture_retired" })).toBe("fixture_retired");
  });

  it("can read a saved result even after its configured adapter was removed", async () => {
    mocks.getProvider.mockImplementation(() => {
      throw new Error("Unknown SERP provider: fixture_retired");
    });
    mocks.backlinkSnapshot.findFirst.mockResolvedValue({
      ...snapshot,
      summary: { _provider: "fixture_retired", _mode: "as_is" },
    });
    await expect(analyzeBacklinks(context, { target: "example.com" })).resolves.toMatchObject({
      provider: "fixture_retired",
      cached: true,
      costCents: 0,
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("filters reusable snapshots by the requested source as well as row mode", async () => {
    await findBacklinksSnapshot(lookup);
    expect(mocks.backlinkSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ summary: { path: ["_provider"], equals: "fixture_b" } }]),
          summary: { path: ["_mode"], equals: "as_is" },
        }),
      }),
    );
  });

  it("isolates current and saved snapshot lookups by source", async () => {
    await findCurrentBacklinksSnapshot(lookup);
    await findStoredBacklinks({ ...lookup, targetScope: "site" });
    for (const [call] of mocks.backlinkSnapshot.findFirst.mock.calls) {
      expect(call.where.AND).toContainEqual({
        summary: { path: ["_provider"], equals: "fixture_b" },
      });
    }
  });

  it("passes explicit provider selection to cache reads without paid I/O", async () => {
    await expect(
      analyzeBacklinks(context, { target: "example.com", provider: "fixture_b" }),
    ).resolves.toMatchObject({ ok: true, provider: "fixture_b", cached: true, costCents: 0 });
    expect(mocks.backlinkSnapshot.findFirst.mock.calls[0][0].where.AND).toContainEqual({
      summary: { path: ["_provider"], equals: "fixture_b" },
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("reopens each provider's own profile for the same target", async () => {
    mocks.backlinkSnapshot.findFirst.mockImplementation(({ where }) => {
      const provider = where.AND?.[0]?.summary?.equals;
      return Promise.resolve(
        provider === "fixture_a" || provider === "fixture_b"
          ? {
              ...snapshot,
              summary: {
                _mode: "as_is",
                _provider: provider,
                backlinksTotal: provider === "fixture_a" ? 11 : 22,
              },
            }
          : null,
      );
    });
    await expect(
      analyzeBacklinks(context, { target: "example.com", provider: "fixture_a" }),
    ).resolves.toMatchObject({
      provider: "fixture_a",
      summary: { backlinksTotal: 11 },
      cached: true,
      costCents: 0,
    });
    await expect(
      analyzeBacklinks(context, { target: "example.com", provider: "fixture_b" }),
    ).resolves.toMatchObject({
      provider: "fixture_b",
      summary: { backlinksTotal: 22 },
      cached: true,
      costCents: 0,
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("keeps legacy stored evidence readable with an unknown source", async () => {
    mocks.backlinkSnapshot.findFirst.mockResolvedValue({
      ...snapshot,
      summary: { _mode: "as_is" },
    });
    await expect(
      findStoredBacklinks({
        includeSubdomains: true,
        mode: "as_is",
        projectId: lookup.projectId,
        target: "example.com",
      }),
    ).resolves.toMatchObject({ provider: "unknown", cached: true, costCents: 0 });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("reopens an explicitly selected legacy source and estimates zero without any provider work", async () => {
    mocks.$queryRaw.mockResolvedValue([{ id: "legacy_1" }]);
    mocks.backlinkSnapshot.findFirst.mockResolvedValue({
      ...snapshot,
      id: "legacy_1",
      summary: { _mode: "as_is" },
    });
    await expect(
      analyzeBacklinks(context, { target: "example.com", provider: "unknown", maxCostCents: 0 }),
    ).resolves.toMatchObject({ provider: "unknown", cached: true, costCents: 0 });
    await expect(
      analyzeBacklinks(context, { target: "example.com", provider: "unknown", estimateOnly: true }),
    ).resolves.toMatchObject({
      provider: "unknown",
      cached: true,
      costCents: 0,
      estimatedCostCents: 0,
      estimate: true,
    });
    expect(mocks.getProvider).not.toHaveBeenCalled();
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("never returns known-provider evidence through the legacy read path", async () => {
    mocks.$queryRaw.mockResolvedValue([{ id: "known_1" }]);
    await expect(
      analyzeBacklinks(context, { target: "example.com", provider: "unknown" }),
    ).resolves.toEqual({ ok: false, reason: "no_source" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("refuses a fresh legacy request rather than buying an assumed source", async () => {
    await expect(
      analyzeBacklinks(context, { target: "example.com", provider: "unknown", fresh: true }),
    ).resolves.toEqual({ ok: false, reason: "no_source" });
    expect(mocks.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.getProvider).not.toHaveBeenCalled();
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("does not silently fall back to another provider for an unsupported selection", async () => {
    mocks.backlinkSnapshot.findFirst.mockResolvedValue(null);
    await expect(
      analyzeBacklinks(context, { target: "example.com", provider: "unsupported" }),
    ).resolves.toEqual({ ok: false, reason: "no_source" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("never extends a legacy snapshot with an assumed provider", async () => {
    mocks.project.findFirst.mockResolvedValue({
      id: lookup.projectId,
      providerConnections: [
        { provider: "dataforseo", id: "connection_1", credentialsEncrypted: "fixture" },
      ],
    });
    mocks.backlinkSnapshot.findFirst.mockResolvedValue({
      ...snapshot,
      summary: { _mode: "as_is" },
    });
    await expect(
      loadMoreBacklinkRows(context, {
        includeSubdomains: true,
        limit: 100,
        snapshotRef: backlinksSnapshotReference({
          id: "snapshot_1",
          projectId: lookup.projectId,
          fetchedRowCount: 100,
        }),
        provider: "fixture_b",
        target: "example.com",
        targetScope: "site",
      }),
    ).resolves.toEqual({ ok: false, reason: "no_source" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
});
