import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readable: vi.fn(),
  connection: vi.fn(),
  count: vi.fn(),
  report: vi.fn(),
  settings: vi.fn(),
  list: vi.fn(),
  sitemaps: vi.fn(),
  budget: vi.fn(),
  days: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.readable }));
vi.mock("./ui-schedule", () => ({
  indexingBackgroundRun: vi.fn(async () => ({ state: "unavailable", nextAt: null })),
}));
vi.mock("./service", () => ({
  connectionForProject: mocks.connection,
  SearchIndexConnectionError: class extends Error {},
}));
vi.mock("./ui-history", () => ({
  storedIndexingDays: mocks.days,
  storedSitemapSnapshot: mocks.snapshot,
}));
vi.mock("./ui-storage", () => ({
  storedNotIndexedCount: mocks.count,
  storedIndexingSitemaps: mocks.sitemaps,
}));
vi.mock("@/lib/presence/inspection-budget", () => ({ getInspectionBudget: mocks.budget }));
vi.mock("./report", () => ({ getPageIndexingReport: mocks.report }));
vi.mock("./settings", () => ({ getPageIndexingSettings: mocks.settings }));
vi.mock("./urls", () => ({ listPageIndexingUrls: mocks.list }));

import { GscPropertyUrlError } from "@/lib/providers/analytics/gsc-property-membership";
import { SearchIndexConnectionError } from "./service";
import { loadNotIndexedCount, loadPageIndexing } from "./ui-queries";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readable.mockResolvedValue({
    actor: { id: "a", role: null, memberships: [{ projectId: "internal", role: "viewer" }] },
    project: { id: "internal", writeMode: "active" },
  });
  mocks.connection.mockResolvedValue({ property: "sc-domain:example.com" });
  mocks.count.mockResolvedValue(248);
  mocks.settings.mockResolvedValue({ budgetMode: "fixed", inspectionDailyLimit: 50 });
});
it("the tab counter reads only the stored not-indexed count", async () => {
  expect(await loadNotIndexedCount("prj_test")).toBe(248);
  expect(mocks.count).toHaveBeenCalledWith("internal", "sc-domain:example.com");
  expect(mocks.report).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
it("the no-connection tab renders an empty state", async () => {
  mocks.report.mockRejectedValueOnce(new SearchIndexConnectionError());
  expect(await loadPageIndexing("prj_test")).toEqual({ canInspect: false, data: null });
});
it.each([new SearchIndexConnectionError(), new GscPropertyUrlError(), new Error("decrypt")])(
  "returns an unknown counter on connection errors: %s",
  async (error) => {
    mocks.connection.mockRejectedValueOnce(error);
    expect(await loadNotIndexedCount("prj_test")).toBeNull();
  },
);
it("returns an unknown counter on storage failure", async () => {
  mocks.count.mockRejectedValueOnce(new Error("database"));
  expect(await loadNotIndexedCount("prj_test")).toBeNull();
});
it("preserves authorization errors", async () => {
  mocks.readable.mockRejectedValue(new Error("forbidden"));
  await expect(loadNotIndexedCount("p")).rejects.toThrow("forbidden");
  await expect(loadPageIndexing("p")).rejects.toThrow("forbidden");
});
it("treats an invalid stored property as no connection", async () => {
  mocks.report.mockRejectedValueOnce(new GscPropertyUrlError());
  expect(await loadPageIndexing("p")).toEqual({ canInspect: false, data: null });
});
it("loads the project allowance without widening the settings contract", async () => {
  mocks.report.mockResolvedValue({ property: "sc-domain:example.com" });
  mocks.list.mockResolvedValue({ data: [], meta: { next_cursor: null } });
  mocks.budget.mockResolvedValue({ limit: 50, used: 50, remaining: 0, publicId: "p", day: {} });
  const result = await loadPageIndexing("p");
  expect(mocks.budget).toHaveBeenCalledWith("internal", expect.any(Date));
  expect(result.data?.allowance).toEqual({ limit: 50, used: 50, remaining: 0 });
});

it("wires stored days and snapshots to the component contract without a live provider call", async () => {
  const days = [
    {
      date: "2026-10-24",
      indexed: 1,
      notIndexed: 0,
      failed: 0,
      checked: 1,
      total: 2,
      inspectedThatDay: 1,
      stop: null,
      changes: { count: 0, entries: [] },
    },
  ];
  const snapshot = { readAt: "2026-10-24T12:00:00Z", lastError: null, lastErrorAt: null, rows: [] };
  mocks.report.mockResolvedValue({ property: "sc-domain:example.com" });
  mocks.days.mockResolvedValue(days);
  mocks.snapshot.mockResolvedValue(snapshot);
  mocks.list.mockResolvedValue({ data: [], meta: { next_cursor: null } });
  mocks.budget.mockResolvedValue({ limit: 50, used: 1, remaining: 49 });
  const result = await loadPageIndexing("p");
  expect(result.data).toMatchObject({ days, sitemapSnapshot: snapshot });
  expect(mocks.days).toHaveBeenCalledWith("internal", "sc-domain:example.com");
  expect(mocks.snapshot).toHaveBeenCalledWith("internal", "sc-domain:example.com");
});
