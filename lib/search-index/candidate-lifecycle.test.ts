vi.mock("@/lib/presence/sitemap-snapshot", () => ({ persistSitemapSnapshot: vi.fn() }));

import { orderInspectionCandidates, refreshInspectionCandidates } from "@/lib/presence/candidates";
import { beforeEach, expect, it, vi } from "vitest";
import { getPageIndexingReport } from "./report";
import { listPageIndexingUrls } from "./urls";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  targets: [] as { targetUrl: string }[],
  defaults: {} as Record<string, unknown>,
  discover: vi.fn(),
  list: vi.fn(),
  lock: vi.fn(),
  dailyLimit: 50,
}));
vi.mock("@/lib/presence/sitemap-candidates", () => ({ discoverSitemapCandidates: state.discover }));
vi.mock("./service", () => ({
  connectionForProject: async () => ({ property: "https://example.com/" }),
}));
vi.mock("./settings", () => ({
  getPageIndexingSettings: async () => ({
    property: "https://example.com/",
    budgetMode: "fixed",
    inspectionDailyLimit: state.dailyLimit,
    todayCount: 2,
    last429Kind: null,
    nextResetAt: new Date("2026-10-25T07:00:00Z"),
  }),
}));

// Minimal Prisma predicate interpreter so report and list exercise their actual shared scope.
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR")
      return (value as Record<string, unknown>[]).some((part) => matches(row, part));
    if (key === "AND")
      return (value as Record<string, unknown>[]).every((part) => matches(row, part));
    if (value instanceof Date) return (row[key] as Date)?.getTime() === value.getTime();
    if (value && typeof value === "object") {
      const filter = value as { in?: unknown[]; not?: unknown; gt?: string };
      if (filter.in) return filter.in.includes(row[key]);
      if ("not" in filter) return row[key] !== filter.not;
      if (filter.gt) return String(row[key]) > filter.gt;
    }
    return row[key] === value;
  });
}
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $executeRaw: state.lock,
    $transaction: async (callback: (tx: unknown) => unknown) => {
      const { prisma } = await import("@/lib/db/prisma");
      return callback(prisma);
    },
    keyword: { findMany: async () => state.targets },
    projectDefaults: {
      findUnique: async () => state.defaults,
      upsert: async ({ update }: { update: object }) => {
        Object.assign(state.defaults, update);
      },
    },
    urlPresence: {
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: Record<string, unknown>;
        orderBy?: object;
        take?: number;
      }) => {
        const rows = state.rows.filter((row) => matches(row, where));
        if (orderBy) rows.sort((a, b) => String(a.url).localeCompare(String(b.url)));
        return rows.slice(0, take);
      },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        for (const row of data)
          if (!state.rows.some((old) => old.url === row.url)) state.rows.push(row);
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
        for (const row of state.rows) if (matches(row, where)) Object.assign(row, data);
      },
    },
  },
}));
const property = "https://example.com/";
const now = new Date("2026-10-24T12:00:00Z");
const refresh = (offset: number) =>
  refreshInspectionCandidates({
    projectId: "project",
    property,
    now: new Date(now.getTime() + offset),
    listSitemaps: state.list,
  });
const row = (path: string, source = "sitemap") => ({
  projectId: "project",
  url: property + path,
  source,
  sitemapUrl: null,
  checkedAt: now,
  verdict: "PASS",
  inspectionError: null,
  lastListedAt: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  state.defaults = {};
  state.dailyLimit = 50;
  state.targets = [{ targetUrl: property + "keyword" }];
  state.rows = [
    row("keyword", "keyword_target"),
    row("manual", "manual"),
    { ...row("outside", "manual"), url: "https://other.test/" },
  ];
  state.list.mockResolvedValue([{ path: property + "sitemap.xml" }]);
  state.discover.mockResolvedValue({
    complete: true,
    urls: new Map([[property + "sitemap", property + "sitemap.xml"]]),
  });
});
it("retires removed sitemap and keyword candidates from report/list while preserving rows", async () => {
  await refresh(0);
  expect((await getPageIndexingReport("project")).total).toBe(2);
  state.targets = [];
  state.discover.mockResolvedValue({ complete: true, urls: new Map() });
  await refresh(1000);
  expect((await getPageIndexingReport("project")).total).toBe(0);
  const result = await listPageIndexingUrls("project", {});
  expect(result.data).toEqual([]);
  const manual = await listPageIndexingUrls("project", { source: "manual" });
  expect(manual.data.map((entry) => entry.url)).toEqual([property + "manual"]);
  expect(manual.data[0]).not.toHaveProperty("lastListedAt");
  expect(manual.data[0]).not.toHaveProperty("fullInspectionRecorded");
  expect(state.rows).toHaveLength(4);
});
it.each(["failed", "incomplete"])(
  "retains only the previously current sitemap candidates on %s discovery",
  async (kind) => {
    state.rows.push({ ...row("already-retired"), lastListedAt: new Date(0) });
    await refresh(0);
    state.targets = [];
    if (kind === "failed") state.list.mockRejectedValue(new Error("provider unavailable"));
    else state.discover.mockResolvedValue({ complete: false, urls: new Map() });
    expect(await refresh(1000)).toEqual([property + "sitemap"]);
    const report = await getPageIndexingReport("project");
    expect(report).toMatchObject({ total: 1, complete: false, discoveryComplete: false });
    const result = await listPageIndexingUrls("project", { limit: 1 });
    expect(result.data.map((entry) => entry.url)).toEqual([property + "sitemap"]);
    expect(result.meta.next_cursor).toBe(null);
  },
);
it("includes current normalized keyword targets before a discovery run", async () => {
  state.rows = [row("", "keyword_target"), row("unused", "keyword_target")];
  state.targets = [{ targetUrl: "https://EXAMPLE.com" }];
  expect((await getPageIndexingReport("project")).total).toBe(1);
  expect((await listPageIndexingUrls("project", {})).data.map((entry) => entry.url)).toEqual([
    property,
  ]);
});

it("ignores older refreshes under the discovery lock", async () => {
  await refresh(1000);
  const snapshot = structuredClone(state.rows);
  state.discover.mockResolvedValue({ complete: true, urls: new Map() });
  expect(await refresh(0)).toEqual([property + "keyword", property + "sitemap"]);
  expect(state.rows).toEqual(snapshot);
  expect(state.defaults.indexingDiscoveryAt).toEqual(new Date(now.getTime() + 1000));
  expect(state.lock).toHaveBeenCalledWith(expect.anything(), "indexing-discovery:project");
});
it("demotes a former keyword target still listed in its sitemap", async () => {
  state.dailyLimit = 2;
  state.targets = [{ targetUrl: property + "old" }];
  state.discover.mockResolvedValue({
    complete: true,
    urls: new Map([
      [property + "old", property + "sitemap.xml"],
      [property + "other", property + "sitemap.xml"],
    ]),
  });
  await refresh(0);
  state.targets = [{ targetUrl: property + "new" }];
  await refresh(1000);
  expect(state.rows.find((entry) => entry.url === property + "old")?.source).toBe("sitemap");
  expect((await getPageIndexingReport("project")).estimatedDaysRemaining).toBe(3);
  const candidates = state.rows.filter((entry) =>
    ["old", "new", "other"].some((path) => entry.url === property + path),
  );
  expect(
    orderInspectionCandidates(
      candidates as { url: string; source: string; checkedAt: Date | null }[],
      property,
      now,
    ).map((entry) => entry.url),
  ).toEqual([property + "new", property + "old", property + "other"]);
});
it("excludes manual-only results from freshness and the denominator", async () => {
  state.rows = [
    { ...row("manual", "manual"), checkedAt: new Date(0) },
    row("keyword", "keyword_target"),
  ];
  const report = await getPageIndexingReport("project");
  expect(report).toMatchObject({ total: 1, checked: 1, oldestResultAt: now });
  expect((await listPageIndexingUrls("project", { source: "manual" })).data).toHaveLength(1);
});
it("lists exactly the total for every group reason, including missing states and failures", async () => {
  state.rows = [
    row("pass"),
    { ...row("pass-unspecified"), coverageState: null },
    { ...row("fail"), verdict: "FAIL", coverageState: "Not found (404)" },
    { ...row("fail-unspecified"), verdict: "FAIL", coverageState: null },
    { ...row("error"), inspectionError: "inspection_failed", checkedAt: null },
    { ...row("old-pass-error"), inspectionError: "inspection_failed" },
    { ...row("unchecked"), checkedAt: null },
  ].map((entry) => ({ coverageState: "Indexed", ...entry, lastListedAt: now }));
  state.defaults = { indexingDiscoveryAt: now };
  state.targets = [];
  for (const group of (await getPageIndexingReport("project")).groups) {
    for (const reason of group.reasons) {
      const result = await listPageIndexingUrls("project", {
        group: group.group,
        ...(reason.coverageState === null ? {} : { coverage_state: reason.coverageState }),
      });
      expect(result.data).toHaveLength(reason.total);
      expect(result.data.every((entry) => entry.group === group.group)).toBe(true);
    }
  }
});

it("a grouped reason excludes failed rows with stale state and unchecked unspecified rows", async () => {
  state.defaults.indexingDiscoveryAt = now;
  const stateText = "Discovered - currently not indexed";
  const listed = { source: "sitemap", lastListedAt: now };
  state.rows = [
    { ...row("not-indexed"), ...listed, verdict: "NEUTRAL", coverageState: stateText },
    {
      ...row("failed"),
      ...listed,
      verdict: "NEUTRAL",
      coverageState: stateText,
      inspectionError: "timeout",
    },
    { ...row("unspecified"), ...listed, verdict: null, coverageState: null },
    { ...row("unchecked"), ...listed, checkedAt: null, verdict: null, coverageState: null },
  ];
  const reason = await listPageIndexingUrls("project", {
    group: "not_indexed",
    coverage_state: stateText,
  });
  expect(reason.data.map((entry) => entry.url)).toEqual([property + "not-indexed"]);
  const unspecified = await listPageIndexingUrls("project", {
    group: "not_indexed",
    coverage_state: "Unspecified",
  });
  expect(unspecified.data.map((entry) => entry.url)).toEqual([property + "unspecified"]);
});
