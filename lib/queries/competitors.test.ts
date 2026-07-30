import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCompetitorsApiView, getCompetitorsView } from "./competitors";

const competitorPublicId = "cmp_aaaaaaaaaaaaaaaaaaaaaaaa";
const projectPublicId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    competitor: { findMany: vi.fn() },
    keyword: { findMany: vi.fn() },
  },
  project: {
    domain: "https://www.example.com",
    id: "project_1",
    publicId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

const location = {
  canonicalKey: "country:us",
  cityName: null,
  countryCode: "US",
  displayName: "United States",
  hl: "en",
  kind: "country" as const,
  languageLabel: "English",
  regionCode: null,
};

function summary(overrides: Record<string, unknown> = {}) {
  return {
    device: "desktop",
    id: "keyword_1",
    locationId: "location_us",
    locationRef: location,
    rankChecks: [
      {
        organicRanks: [
          { domain: "suggestion.dev", position: 2 },
          { domain: "rankzly.io", position: 3 },
          { domain: "example.com", position: 6 },
        ],
        position: 6,
      },
    ],
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    device: "desktop",
    id: "keyword_1",
    locationId: "location_us",
    publicId: "kw_1",
    tags: [{ tag: { name: "Product" } }],
    text: "rank tracker",
    ...overrides,
  };
}

describe("competitors query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.prisma.competitor.findMany.mockResolvedValue([
      {
        domain: "rankzly.io",
        id: "competitor_db_1",
        label: "Rankzly",
        publicId: competitorPublicId,
      },
    ]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.keyword.findMany.mockImplementation(async (query) =>
      query.select.publicId ? [detail()] : [summary()],
    );
  });

  it("uses the deterministic most-checked market and fetches only its detailed keywords", async () => {
    mocks.prisma.keyword.findMany.mockImplementation(async (query) =>
      query.select.publicId
        ? [detail()]
        : [
            summary(),
            summary({ rankChecks: [] }),
            summary({
              device: "mobile",
              locationId: "location_pl",
              locationRef: { ...location, canonicalKey: "country:pl", displayName: "Poland" },
            }),
          ],
    );

    const view = await getCompetitorsView("prj_1");

    expect(view.scope).toEqual({ device: "desktop", engine: "google", locationId: "location_us" });
    expect(view.market?.rows[0]).toMatchObject({
      id: "kw_1",
      ranks: { "example.com": 6, "rankzly.io": 3 },
    });
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.keyword.findMany.mock.calls[0]?.[0]).not.toHaveProperty("take");
    expect(mocks.prisma.keyword.findMany.mock.calls[1]?.[0]).toMatchObject({
      where: { device: "desktop", locationId: "location_us", projectId: "project_1" },
    });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("does not fall back when an explicit valid tuple has no tracked keywords", async () => {
    const requested = { device: "mobile", engine: "google", locationId: "location_us" } as const;

    const view = await getCompetitorsView("prj_1", requested);

    expect(view.market).toBeNull();
    expect(view.scope).toEqual(requested);
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledOnce();
  });

  it("keeps suggestions project-wide and projects a newly managed domain from snapshots", async () => {
    const view = await getCompetitorsView("prj_1");

    expect(view.suggestions).toEqual([{ domain: "suggestion.dev", initials: "SD", overlap: 1 }]);
    expect(view.market?.rows[0]?.ranks["rankzly.io"]).toBe(3);
  });

  it("builds full market projections for the public API", async () => {
    const view = await getCompetitorsApiView("prj_1");

    expect(view.markets[0]).toMatchObject({
      columns: expect.arrayContaining([expect.objectContaining({ domain: "rankzly.io" })]),
      location: "United States",
      rows: [expect.objectContaining({ id: "kw_1" })],
      shares: expect.any(Array),
    });
    expect(mocks.prisma.keyword.findMany.mock.calls[1]?.[0]).toMatchObject({
      where: { projectId: "project_1" },
    });
    expect(view).toMatchObject({
      managedCompetitors: [expect.objectContaining({ id: competitorPublicId })],
      projectId: projectPublicId,
    });
    expect(JSON.stringify(view)).not.toContain("competitor_db_1");
  });

  it("uses raw payloads only for legacy latest checks without a compact snapshot", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        keywordId: "keyword_1",
        raw: {
          organic_results: [
            { domain: "rankzly.io", position: 2 },
            { domain: "legacy.dev", position: 4 },
          ],
        },
      },
    ]);
    mocks.prisma.keyword.findMany.mockImplementation(async (query) =>
      query.select.publicId
        ? [detail()]
        : [summary({ rankChecks: [{ organicRanks: null, position: 6 }] })],
    );

    const view = await getCompetitorsView("prj_1");

    expect(view.market?.rows[0]?.ranks["rankzly.io"]).toBe(2);
    expect(view.suggestions).toContainEqual({ domain: "legacy.dev", initials: "LD", overlap: 1 });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.keyword.findMany.mock.calls[1]?.[0].select).not.toHaveProperty(
      "rankChecks",
    );
  });
});
