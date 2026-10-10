import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKeywords } from "./keyword-create";
import { createKeywordAfterDefault } from "./keyword-create-test-harness";

// The real translator, location service, resolver, and Prisma-backed store run here;
// only the database rows and the audit sink are faked. Both wire shapes must reach the
// same persisted keyword row through the same canonical location key.
const mocks = vi.hoisted(() => ({
  prisma: {
    location: { findUnique: vi.fn(), upsert: vi.fn() },
    providerConnection: { findMany: vi.fn() },
    rankCheck: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));

const defaults = {
  city: null,
  country: "United States",
  device: "desktop" as const,
  locationKey: "US",
};

type Run = Awaited<ReturnType<typeof createKeywordAfterDefault>>;

// Public ids are generated per row; everything else must match between the two shapes.
function persistedRows(run: Run) {
  return run.createdRows.map(({ publicId: _publicId, ...row }) => row);
}

async function responseBody(run: Run) {
  const body = (await run.response.json()) as {
    results: { keyword: { id: string } }[];
  };
  return {
    ...body,
    results: body.results.map(({ keyword: { id: _id, ...keyword }, ...result }) => ({
      ...result,
      keyword,
    })),
  };
}

describe("keyword create legacy market contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.location.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheck.groupBy.mockResolvedValue([]);
    mocks.prisma.location.upsert.mockImplementation(
      ({ create }: { create: { canonicalKey: string } }) =>
        Promise.resolve({ ...create, id: `loc_${create.canonicalKey}` }),
    );
  });

  it.each([
    ["country name", { country: "Germany" }, { location_key: "DE" }],
    ["location alias", { location: "usa" }, { location_key: "US" }],
    ["country plus language", { country: "Spain", language: "en" }, { location_key: "ES@en" }],
    ["country plus default language", { country: "Spain", language: "es" }, { location_key: "ES" }],
  ])(
    "persists the same keyword for the legacy %s shape and the location_key shape",
    async (_label, legacy, modern) => {
      const old = await createKeywordAfterDefault(defaults, { keyword: "rank tracker", ...legacy });
      const fresh = await createKeywordAfterDefault(defaults, {
        keyword: "rank tracker",
        ...modern,
      });

      expect(old.response.status).toBe(201);
      expect(fresh.response.status).toBe(201);
      expect(old.createdRows).toHaveLength(1);
      expect(persistedRows(fresh)).toEqual(persistedRows(old));
      expect(await responseBody(fresh)).toEqual(await responseBody(old));
    },
  );
});

describe("keyword create check-state contract", () => {
  const checkedAt = new Date("2026-09-10T00:00:00.000Z");
  const existingKeyword = {
    archivedAt: null,
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
    device: "desktop",
    id: "keyword_1",
    intent: null,
    location: "United States",
    locationId: "loc_US",
    locationRef: { canonicalKey: "US", languageCode: "en", languageLabel: "English" },
    project: { defaults: null },
    publicId: "kw_b00000000000000000000000",
    rankChecks: [
      {
        checkedAt,
        error: null,
        errorCode: null,
        position: 3,
        publicId: "check_b00000000000000000000000",
        run: null,
        status: "completed",
      },
    ],
    schedule: null,
    tags: [],
    targetUrl: null,
    text: "rank tracker",
    topic: null,
    updatedAt: new Date("2026-09-05T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.location.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheck.groupBy.mockResolvedValue([]);
    mocks.prisma.location.upsert.mockImplementation(
      ({ create }: { create: { canonicalKey: string } }) =>
        Promise.resolve({ ...create, id: `loc_${create.canonicalKey}` }),
    );
  });

  it("serializes the latest successful check for a skipped pre-existing keyword", async () => {
    mocks.prisma.rankCheck.groupBy.mockResolvedValue([
      { _max: { checkedAt }, keywordId: "keyword_1" },
    ]);
    mocks.prisma.rankCheck.findMany.mockResolvedValueOnce([
      {
        checkedAt,
        keywordId: "keyword_1",
        position: 3,
        publicId: "check_b00000000000000000000000",
        rankingUrl: "https://example.com/ranking",
        run: null,
      },
    ]);
    const client = {
      $executeRaw: async () => 0,
      $queryRaw: async () => [],
      auditLog: { create: async () => ({}) },
      keyword: {
        findMany: async (args: { include?: unknown; select?: { archivedAt?: boolean } }) => {
          if (args.include) return [existingKeyword];
          if (args.select?.archivedAt) return [existingKeyword];
          return [];
        },
      },
      keywordSchedule: { createMany: async () => ({ count: 0 }) },
      keywordTag: { createMany: async () => ({ count: 0 }) },
      projectDefaults: { findUnique: async () => defaults },
      projectMarket: {
        findMany: async () => [],
        upsert: async () => ({ publicId: "pmkt_a00000000000000000000000" }),
      },
      tag: { createMany: async () => ({ count: 0 }), findMany: async () => [] },
    };
    const req = new Request(
      "https://example.com/api/v1/projects/prj_a00000000000000000000000/keywords",
      {
        body: JSON.stringify({ keyword: "rank tracker", location_key: "US" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    const response = await createKeywords(
      {
        auth: {
          apiKey: { projectId: "project_1" },
          project: { id: "project_1", publicId: "prj_a00000000000000000000000" },
        },
        headers: new Headers(),
        instance: "urn:bisibility:test",
        method: "POST",
        path: ["projects", "prj_a00000000000000000000000", "keywords"],
        req,
        url: new URL(req.url),
      } as never,
      "prj_a00000000000000000000000",
      client as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      created: 0,
      results: [
        {
          keyword: {
            id: "kw_b00000000000000000000000",
            latest_check: { observation_completeness: null, position: 3 },
            latest_successful_check: { observation_completeness: null, position: 3 },
          },
          status: "skipped",
        },
      ],
      skipped: 1,
    });
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith({
      select: {
        checkedAt: true,
        keywordId: true,
        observationRun: { select: { completeness: true } },
        position: true,
        publicId: true,
        rankingUrl: true,
        run: { select: { publicId: true } },
      },
      where: {
        OR: [{ keywordId: "keyword_1", checkedAt }],
        status: "completed",
      },
    });
    const findManyArg = mocks.prisma.rankCheck.findMany.mock.calls[0][0];
    expect(findManyArg).not.toHaveProperty("distinct");
  });
});
