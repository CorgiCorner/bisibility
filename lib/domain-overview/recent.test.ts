import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { domainOverviewSnapshot: { findMany: mocks.findMany } },
}));

import { recentDomainOverviewTargets } from "./recent";

describe("recent domain overview targets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the newest market row per target and respects the limit", async () => {
    const now = new Date("2026-08-11T20:00:00.000Z");
    mocks.findMany.mockResolvedValue([
      {
        cachedUntil: new Date("2026-08-12T00:00:00.000Z"),
        fetchedAt: new Date("2026-08-11T12:00:00.000Z"),
        languageCode: "en",
        locationCode: 2840,
        scope: "subdomain",
        target: "shop.example.com",
      },
      {
        cachedUntil: new Date("2026-08-11T23:00:00.000Z"),
        fetchedAt: new Date("2026-08-11T11:00:00.000Z"),
        languageCode: "de",
        locationCode: 2276,
        scope: "subdomain",
        target: "shop.example.com",
      },
      {
        cachedUntil: new Date("2026-08-11T22:00:00.000Z"),
        fetchedAt: new Date("2026-08-11T10:00:00.000Z"),
        languageCode: "en",
        locationCode: 2826,
        scope: "root",
        target: "example.co.uk",
      },
      {
        cachedUntil: new Date("2026-08-11T21:00:00.000Z"),
        fetchedAt: new Date("2026-08-11T09:00:00.000Z"),
        languageCode: "en",
        locationCode: 2840,
        scope: "root",
        target: "third.example",
      },
    ]);

    await expect(recentDomainOverviewTargets("project_1", 2, now)).resolves.toEqual([
      {
        cachedUntil: "2026-08-12T00:00:00.000Z",
        fetchedAt: "2026-08-11T12:00:00.000Z",
        languageCode: "en",
        locationCode: 2840,
        scope: "subdomain",
        target: "shop.example.com",
      },
      {
        cachedUntil: "2026-08-11T22:00:00.000Z",
        fetchedAt: "2026-08-11T10:00:00.000Z",
        languageCode: "en",
        locationCode: 2826,
        scope: "root",
        target: "example.co.uk",
      },
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: { fetchedAt: "desc" },
      select: {
        cachedUntil: true,
        fetchedAt: true,
        languageCode: true,
        locationCode: true,
        scope: true,
        target: true,
      },
      take: 16,
      where: { cachedUntil: { gt: now }, projectId: "project_1" },
    });
  });

  it("returns an empty list when there are no snapshots", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(recentDomainOverviewTargets("project_1")).resolves.toEqual([]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 64,
        where: { cachedUntil: { gt: expect.any(Date) }, projectId: "project_1" },
      }),
    );
  });
});
