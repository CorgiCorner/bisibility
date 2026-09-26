import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDomainOverviewSnapshot } from "./snapshot";

const mocks = vi.hoisted(() => ({
  fetchMetrics: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    domainOverviewSnapshot: { findFirst: vi.fn() },
  },
  tx: {
    domainOverviewSnapshot: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  withCache: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./cache", () => ({ withDomainOverviewCache: mocks.withCache }));
vi.mock("./provider-call", () => ({ fetchDomainOverviewMetrics: mocks.fetchMetrics }));

const key = {
  languageCode: "pl",
  locationCode: 2616,
  projectId: "project_1",
  scope: "root" as const,
  target: "example.com",
};

describe("domain overview snapshot origin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.withCache.mockImplementation(async ({ load }: { load: () => Promise<unknown> }) => ({
      cached: false,
      status: "success",
      value: await load(),
    }));
    mocks.tx.domainOverviewSnapshot.findUnique.mockResolvedValue({
      fetchedAt: new Date("2026-07-30T10:00:00.000Z"),
    });
    mocks.tx.domainOverviewSnapshot.update.mockResolvedValue({
      cachedUntil: new Date("2026-07-30T22:00:00.000Z"),
      fetchedAt: new Date("2026-07-30T10:00:00.000Z"),
      overview: Prisma.DbNull,
      previousFetchedAt: null,
      previousOverview: null,
      previousSourceSnapshotAt: null,
      provider: "dataforseo",
      sourceSnapshotAt: null,
    });
    mocks.fetchMetrics.mockResolvedValue({ costCents: 1, metrics: null, sourceSnapshotAt: null });
  });

  it("threads the paying request origin into the overview provider call", async () => {
    const origin = {
      credential: { id: "key_1", kind: "project_key" as const },
      source: "cli" as const,
    };

    await expect(
      resolveDomainOverviewSnapshot({
        ...key,
        fresh: true,
        key: "overview-key",
        origin,
        project: { budgetCapCents: 100 } as never,
        source: { provider: { id: "dataforseo" } } as never,
      }),
    ).resolves.toMatchObject({ cached: false, costCents: 1 });

    expect(mocks.fetchMetrics).toHaveBeenCalledWith(expect.objectContaining({ origin }));
  });
});
