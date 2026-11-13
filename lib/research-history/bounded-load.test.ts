import { beforeEach, expect, it, vi } from "vitest";
import { HISTORY_SCAN_BOUND } from "./contract";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  reports: vi.fn(),
  runs: vi.fn(),
  snapshots: vi.fn(),
  pins: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    agentReport: { findMany: mocks.reports },
    keywordResearchSnapshot: { findMany: mocks.snapshots },
    projectDefaults: { findUnique: vi.fn(async () => ({ timezone: "UTC" })) },
    providerComparisonRun: { findMany: mocks.runs },
    researchHistoryPin: { findMany: mocks.pins },
  },
}));

import { readModelPlaygroundHistory } from "@/lib/ai-research/model-playground-history";
import { readKeywordResearchHistory } from "@/lib/keyword-research/history";
import { readPlaygroundHistory } from "@/lib/provider-comparison/playground-history";

const request = { cursor: null, filters: [], query: "example.com" };

function sqlOf(value: unknown) {
  if (Array.isArray(value)) return value.join(" ");
  return value && typeof value === "object" && "sql" in value ? String(value.sql) : "";
}

function assertBounded(calls: ReadonlyArray<ReadonlyArray<unknown>>, label: string) {
  expect(calls.length, label).toBeGreaterThan(0);
  for (const call of calls) {
    const take = (call[0] as { take?: unknown }).take;
    expect(take, label).toEqual(expect.any(Number));
    expect(take as number).toBeLessThanOrEqual(HISTORY_SCAN_BOUND);
  }
}

beforeEach(() => {
  mocks.queryRaw.mockReset();
  mocks.reports.mockReset();
  mocks.runs.mockReset();
  mocks.snapshots.mockReset();
  mocks.pins.mockReset();
  mocks.reports.mockResolvedValue([]);
  mocks.runs.mockResolvedValue([]);
  mocks.snapshots.mockResolvedValue([]);
  mocks.pins.mockResolvedValue([]);
  mocks.queryRaw.mockImplementation(async (query: unknown) => {
    const sql = sqlOf(query);
    if (sql.includes("COUNT")) return [{ count: 0 }];
    if (sql.includes("DISTINCT") || sql.includes("UNION")) return [];
    return [
      {
        id: "row-1",
        createdAt: new Date("2026-11-10T00:00:00Z"),
        fetchedAt: new Date("2026-11-10T00:00:00Z"),
      },
    ];
  });
});

it("loads model history with a take on every findMany and a limit on every id query", async () => {
  await readModelPlaygroundHistory("project", "user", request);
  assertBounded(mocks.reports.mock.calls, "model reports");
  for (const [query] of mocks.queryRaw.mock.calls) {
    const sql = sqlOf(query);
    if (!sql.includes("COUNT")) expect(sql).toContain("LIMIT");
  }
});

it("loads SERP history with a take on every findMany and a limit on every id query", async () => {
  mocks.queryRaw.mockClear();
  await readPlaygroundHistory("project", "user", request);
  assertBounded(mocks.runs.mock.calls, "serp runs");
  for (const [query] of mocks.queryRaw.mock.calls) {
    const sql = sqlOf(query);
    if (!sql.includes("COUNT")) expect(sql).toContain("LIMIT");
  }
});

it("loads keyword history with a take on every findMany and a limit on every id query", async () => {
  mocks.queryRaw.mockClear();
  await readKeywordResearchHistory("project", "user", request);
  assertBounded(mocks.snapshots.mock.calls, "keyword snapshots");
  for (const [query] of mocks.queryRaw.mock.calls) {
    const sql = sqlOf(query);
    if (!sql.includes("COUNT")) expect(sql).toContain("LIMIT");
  }
});
