import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  pins: vi.fn(),
  queryRaw: vi.fn(),
  timeZone: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    projectDefaults: { findUnique: mocks.timeZone },
    providerComparisonRun: { findMany: mocks.find },
    researchHistoryPin: { findMany: mocks.pins },
  },
}));

import { readPlaygroundHistory, readRecentPlaygroundSearches } from "./playground-history";

const search = { ...comparisonFixture(), version: 2, keywordId: null };
const row = { id: "run", createdAt: new Date("2026-11-09T10:00:00Z"), snapshot: search };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.timeZone.mockResolvedValue({ timezone: "UTC" });
  mocks.pins.mockResolvedValue([]);
  mocks.queryRaw.mockImplementation(async (query: unknown) => {
    const sql = Array.isArray(query) ? query.join(" ") : "";
    if (sql.includes("COUNT")) return [{ count: 1 }];
    if (sql.includes("DISTINCT")) return [];
    return [{ id: "run", createdAt: row.createdAt }];
  });
});

it("groups a later AI Overview into the organic row without loading result bodies", async () => {
  mocks.timeZone.mockResolvedValue({ timezone: "UTC" });
  mocks.pins.mockResolvedValue([{ itemKey: "organic" }]);
  const organic = { ...comparisonFixture(), version: 2, keywordId: null, text: "example.com rank" };
  const overview = {
    ...organic,
    aiOverview: true as const,
    depth: 10 as const,
    connections: organic.connections.filter((connection) => connection.provider === "serpapi"),
  };
  mocks.queryRaw.mockImplementation(async (query: unknown) => {
    const sql = Array.isArray(query) ? query.join(" ") : "";
    if (sql.includes("COUNT")) return [{ count: 1 }];
    if (sql.includes("DISTINCT")) return [];
    return [{ id: "organic", createdAt: new Date("2026-11-10T10:00:00Z") }];
  });
  mocks.find
    .mockResolvedValueOnce([
      {
        id: "organic",
        createdAt: new Date("2026-11-10T10:00:00Z"),
        snapshot: organic,
        sides: [{ costCents: 20, customerCostCents: null }],
      },
    ])
    .mockResolvedValueOnce([
      {
        id: "overview",
        createdAt: new Date("2026-11-10T11:00:00Z"),
        snapshot: overview,
        sides: [{ costCents: 5, customerCostCents: null }],
      },
    ]);
  const page = await readPlaygroundHistory(
    "project",
    "user",
    { cursor: null, filters: [], query: "" },
    new Date("2026-11-10T12:00:00Z"),
  );
  const select = mocks.find.mock.calls[0]?.[0].select;
  expect(select).toMatchObject({
    sides: { select: { costCents: true, customerCostCents: true } },
    snapshot: true,
  });
  expect(select.sides.select).not.toHaveProperty("result");
  expect(mocks.find.mock.calls[0]?.[0]).toMatchObject({ take: 1 });
  expect(mocks.find.mock.calls[1]?.[0].take).toBeLessThanOrEqual(200);
  expect(page.total).toBe(1);
  expect(page.groups[0]?.rows[0]).toMatchObject({
    key: "organic",
    pinned: true,
    meta: { aiOverview: true, kind: "serp" },
    cost: { kind: "amount", amount: { value: "0.25" } },
  });
});

it("lists searches only and marks the one whose AI overview was fetched", async () => {
  mocks.find.mockResolvedValueOnce([{ ...row, sides: [] }]).mockResolvedValueOnce([
    {
      ...row,
      id: "overview",
      sides: [],
      snapshot: {
        ...search,
        aiOverview: true,
        depth: 10,
        connections: search.connections.filter((side) => side.provider === "serpapi"),
      },
    },
  ]);
  const result = await readPlaygroundHistory("project", "user", {
    cursor: null,
    filters: [],
    query: "",
  });
  const [page, fetched] = mocks.find.mock.calls.map(([input]) => input.where);
  // A search has no such key. A negated JSON path matches no row without it and would hide all.
  expect(page.AND).toContainEqual({
    snapshot: { path: ["aiOverview"], equals: Prisma.DbNull },
  });
  expect(JSON.stringify(page)).not.toContain("NOT");
  expect(fetched).toMatchObject({
    projectId: "project",
    keywordId: null,
    sides: { some: { provider: "serpapi", status: "completed" } },
  });
  expect(result.total).toBe(1);
  expect(result.groups.flatMap((group) => group.rows)).toEqual([
    expect.objectContaining({ key: "run", meta: expect.objectContaining({ aiOverview: true }) }),
  ]);
});

it("does not mark a search for an overview fetched on another device", async () => {
  mocks.find.mockResolvedValueOnce([{ ...row, sides: [] }]).mockResolvedValueOnce([
    {
      ...row,
      id: "overview",
      sides: [],
      snapshot: {
        ...search,
        aiOverview: true,
        depth: 10,
        connections: search.connections.filter((side) => side.provider === "serpapi"),
        device: search.device === "mobile" ? "desktop" : "mobile",
      },
    },
  ]);
  const result = await readPlaygroundHistory("project", "user", {
    cursor: null,
    filters: [],
    query: "",
  });
  expect(result.groups[0].rows[0].meta).toMatchObject({ aiOverview: false });
});

it("keeps fetched AI overviews out of the recent searches of the playground page", async () => {
  mocks.find
    .mockResolvedValueOnce([
      {
        ...row,
        sides: search.connections.map(({ provider }) => ({
          provider,
          status: "completed",
          costCents: null,
          customerCostCents: null,
          quantity: null,
          reason: null,
          result: null,
        })),
      },
    ])
    .mockResolvedValueOnce([{ snapshot: { ...search, aiOverview: true } }]);
  const recent = await readRecentPlaygroundSearches("project");
  expect(mocks.find.mock.calls[0][0]).toMatchObject({
    take: 12,
    where: {
      projectId: "project",
      keywordId: null,
      AND: [{ snapshot: { path: ["aiOverview"], equals: Prisma.DbNull } }],
    },
  });
  expect(recent).toEqual([expect.objectContaining({ id: "run", overviewFetched: true })]);
});

it("asks for no overviews when there is no search to mark", async () => {
  mocks.find.mockResolvedValueOnce([]);
  expect(await readRecentPlaygroundSearches("project")).toEqual([]);
  expect(mocks.find).toHaveBeenCalledTimes(1);
});

it("keeps the keyset page metadata-only, including facets and pin filters", async () => {
  mocks.queryRaw.mockResolvedValue([]);
  const page = await readPlaygroundHistory("project", "user", {
    cursor: null,
    filters: [{ facet: "device", value: "mobile" }],
    query: "Coffee",
    limit: 3,
  });
  expect(page.groups).toEqual([]);
  expect(mocks.find).not.toHaveBeenCalled();
  for (const [strings, ...values] of mocks.queryRaw.mock.calls) {
    const sql = Prisma.sql(strings, ...values).sql;
    expect(sql).toContain("snapshot->'aiOverview' IS NULL");
    expect(sql).not.toContain("NOT EXISTS");
    if (!sql.includes("COUNT")) expect(sql).toContain("LIMIT");
  }
});
