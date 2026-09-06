import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getKeywordCount,
  getKeywordDefaultMarket,
  getKeywordDetail,
  getKeywordRows,
  getKeywordTagSuggestions,
} from "./keywords";

const mocks = vi.hoisted(() => ({
  fetchKeywordMetrics: vi.fn(),
  fetchProjectKeywordMetrics: vi.fn(),
  fetchProjectKeywordTraffic: vi.fn(),
  getKeywordTraffic: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    keyword: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
    tag: { findMany: vi.fn() },
    urlPresence: { findUnique: vi.fn() },
  },
  project: {
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_a00000000000000000000000",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./keyword-metrics-query", () => ({
  fetchKeywordMetrics: mocks.fetchKeywordMetrics,
  fetchProjectKeywordMetrics: mocks.fetchProjectKeywordMetrics,
}));
vi.mock("./keyword-traffic", () => ({
  fetchProjectKeywordTraffic: mocks.fetchProjectKeywordTraffic,
  getKeywordTraffic: mocks.getKeywordTraffic,
}));

const canada = {
  canonicalKey: "CA",
  cityName: null,
  countryCode: "CA",
  displayName: "Canada",
  gl: "ca",
  hl: "en",
  id: "location_ca",
  kind: "country" as const,
  languageLabel: "English",
};
const unitedStates = {
  canonicalKey: "US",
  cityName: null,
  countryCode: "US",
  displayName: "United States",
  gl: "us",
  hl: "en",
  id: "location_us",
  kind: "country" as const,
  languageLabel: "English",
};

function keywordFixture(overrides: Record<string, unknown>) {
  return {
    archivedAt: null,
    checkSchedule: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    device: "mobile",
    id: "keyword_active",
    intent: null,
    location: "Canada",
    locationRef: canada,
    publicId: "kw_a00000000000000000000000",
    queuedRankCheckTasks: [],
    rankChecks: [],
    schedule: null,
    tags: [{ tag: { name: "Active" } }],
    targetUrl: null,
    text: "active keyword",
    topic: null,
    ...overrides,
  };
}

const activeKeyword = keywordFixture({});
const archivedKeyword = keywordFixture({
  archivedAt: new Date("2026-09-04T20:00:00.000Z"),
  device: "desktop",
  id: "keyword_archived",
  location: "United States",
  locationRef: unitedStates,
  publicId: "kw_d00000000000000000000000",
  tags: [{ tag: { name: "Archived" } }],
  text: "archived keyword",
});
const keywordFixtures = [activeKeyword, archivedKeyword];

function hasActiveFilter(where: Record<string, unknown> | undefined) {
  return where?.archivedAt === null;
}

describe("archived keyword queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.fetchProjectKeywordMetrics.mockResolvedValue(new Map());
    mocks.fetchProjectKeywordTraffic.mockResolvedValue(new Map());
    mocks.fetchKeywordMetrics.mockResolvedValue({
      cpc: null,
      difficulty: null,
      serpFeatures: [],
      volume: null,
    });
    mocks.getKeywordTraffic.mockResolvedValue({
      hasAnalyticsConnection: false,
      pages: [],
      query: null,
    });
    mocks.prisma.$queryRaw.mockResolvedValue(keywordFixtures);
    mocks.prisma.keyword.findMany.mockImplementation(async ({ where }) =>
      hasActiveFilter(where) ? [activeKeyword] : keywordFixtures,
    );
    mocks.prisma.keyword.count.mockImplementation(async ({ where }) =>
      hasActiveFilter(where) ? 1 : keywordFixtures.length,
    );
    mocks.prisma.keyword.findFirst.mockResolvedValue(null);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _min: { position: 8 } });
    mocks.prisma.tag.findMany.mockImplementation(async ({ where }) => {
      const activeOnly = where?.keywords?.some?.keyword?.archivedAt === null;
      return activeOnly
        ? [{ _count: { keywords: 1 }, createdAt: new Date("2026-09-01"), name: "Active" }]
        : [
            { _count: { keywords: 1 }, createdAt: new Date("2026-09-01"), name: "Active" },
            { _count: { keywords: 1 }, createdAt: new Date("2026-09-02"), name: "Archived" },
          ];
    });
    mocks.prisma.urlPresence.findUnique.mockResolvedValue(null);
  });

  it("excludes the archived fixture from keyword rows", async () => {
    await expect(getKeywordRows(mocks.project.publicId)).resolves.toMatchObject([
      { id: activeKeyword.publicId },
    ]);
  });

  it("excludes the archived fixture from the keyword count", async () => {
    await expect(getKeywordCount(mocks.project.publicId)).resolves.toBe(1);
    expect(mocks.requireReadableProject).toHaveBeenCalledWith(mocks.project.publicId);
    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({
      where: { archivedAt: null, projectId: "project_1" },
    });
  });

  it("excludes the archived fixture from the default market", async () => {
    await expect(getKeywordDefaultMarket(mocks.project.publicId)).resolves.toMatchObject({
      country: "Canada",
      device: "mobile",
    });
  });

  it("excludes tags used only by the archived fixture from suggestions", async () => {
    await expect(getKeywordTagSuggestions(mocks.project.publicId)).resolves.toEqual(["Active"]);
  });

  it("orders active tag suggestions by usage, then recency", async () => {
    mocks.prisma.tag.findMany.mockResolvedValueOnce([
      { _count: { keywords: 1 }, createdAt: new Date("2026-06-01"), name: "Docs" },
      { _count: { keywords: 3 }, createdAt: new Date("2026-05-01"), name: "Product" },
      { _count: { keywords: 1 }, createdAt: new Date("2026-06-15"), name: "Integration" },
    ]);

    await expect(getKeywordTagSuggestions(mocks.project.publicId)).resolves.toEqual([
      "Product",
      "Integration",
      "Docs",
    ]);
    expect(mocks.prisma.tag.findMany).toHaveBeenCalledWith({
      include: {
        _count: {
          select: { keywords: { where: { keyword: { archivedAt: null } } } },
        },
      },
      orderBy: { createdAt: "desc" },
      where: {
        keywords: { some: { keyword: { archivedAt: null } } },
        projectId: "project_1",
      },
    });
  });

  it("returns an archived keyword with its stored rank history and archive state", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValueOnce({
      ...archivedKeyword,
      alertTargets: [],
      project: { defaults: null, domain: "example.com", providerConnections: [] },
      rankChecks: [
        {
          checkedAt: new Date("2026-09-03T08:00:00.000Z"),
          degradedToCountry: false,
          errorCode: null,
          id: "check_archived",
          normalizationVersion: "v2",
          position: 8,
          previousPosition: 11,
          provider: "fixture",
          rankingUrl: "https://example.com/archived",
          requestedDepth: 100,
          status: "completed",
        },
      ],
    });

    const detail = await getKeywordDetail(mocks.project.publicId, archivedKeyword.publicId);

    expect(detail?.archivedAt).toBe("2026-09-04T20:00:00.000Z");
    expect(detail?.positionHistory.map((point) => point.position)).toEqual([8]);
    expect(mocks.prisma.keyword.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project_1", publicId: archivedKeyword.publicId },
      }),
    );
  });
});
