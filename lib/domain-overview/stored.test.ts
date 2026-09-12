import { beforeEach, describe, expect, it, vi } from "vitest";
import { findStoredDomainOverview, listStoredDomainOverviews } from "./stored";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { domainOverviewSnapshot: mocks } }));
vi.mock("@/lib/provider-lookups/cache", () => {
  throw new Error("no cache import");
});
vi.mock("@/lib/provider-lookups/paid-call", () => {
  throw new Error("no paid import");
});
vi.mock("./cache", () => {
  throw new Error("no cache helper import");
});
vi.mock("./provider-call", () => {
  throw new Error("no provider call import");
});

const overview = {
  count: 1,
  etv: 1,
  estimatedTrafficCostCents: 1,
  isDown: 0,
  isLost: 0,
  isNew: 0,
  isUp: 0,
  pos1: 1,
  pos11_20: 0,
  pos21_30: 0,
  pos2_3: 0,
  pos31_40: 0,
  pos41_50: 0,
  pos4_10: 0,
  pos51_60: 0,
  pos61_70: 0,
  pos71_80: 0,
  pos81_90: 0,
  pos91_100: 0,
};
const snapshot = {
  cachedUntil: new Date("2026-08-02T12:00:00.000Z"),
  fetchedAt: new Date("2026-08-01T12:00:00.000Z"),
  history: null,
  languageCode: "en",
  locationCode: 2840,
  overview,
  previousFetchedAt: null,
  previousOverview: null,
  previousSourceSnapshotAt: null,
  projectId: "project_1",
  provider: "Stored provider",
  rankedKeywords: null,
  relevantPages: { costCents: 0, rows: [], totalCount: 0 },
  scope: "root",
  sourceSnapshotAt: null,
  target: "example.com",
};

describe("stored domain overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(snapshot);
    mocks.findMany.mockResolvedValue([snapshot]);
  });

  it("returns only persisted modules and keeps missing modules null", async () => {
    await expect(
      findStoredDomainOverview({
        languageCode: "en",
        locationCode: 2840,
        now: new Date("2026-09-10T12:00:00.000Z"),
        projectId: "project_1",
        scope: "root",
        target: "example.com",
      }),
    ).resolves.toMatchObject({
      costCents: 0,
      history: null,
      keywords: null,
      pages: { rows: [] },
      partial: true,
      stale: true,
    });
  });

  it("lists saved overview dimensions without provider state", async () => {
    await expect(listStoredDomainOverviews({ projectId: "project_1" })).resolves.toEqual([
      expect.objectContaining({ languageCode: "en", locationCode: 2840, target: "example.com" }),
    ]);
  });
});
