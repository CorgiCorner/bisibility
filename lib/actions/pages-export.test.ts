import { connectedSources, pageRow, pagesList } from "@/lib/pages/pages.test-fixture";
import { defaultProjectPagesQuery, projectPagesLoadRequest } from "@/lib/pages/url-state";
import { beforeEach, expect, it, vi } from "vitest";
import { exportProjectPagesCsv } from "./pages-export";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), list: vi.fn(), sources: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pages/queries", () => ({
  getProjectPagesExportList: mocks.list,
  getProjectPageSources: mocks.sources,
}));
vi.mock("./_shared", () => ({
  getActionActor: async () => ({ id: "actor" }),
  requireProjectScope: mocks.scope,
  parseActionInput: (schema: { parse: (v: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
}));
const request = {
  ...projectPagesLoadRequest("prj_1", {
    ...defaultProjectPagesQuery,
    page: 3,
    search: "docs",
    tag: "tag_docs",
    sitemap: "not_listed",
    status: "new",
    source: "manual",
    cwv: "pass",
    index: "indexed",
    coverage: "Submitted",
    period: "90",
    sort: "path",
    dir: "asc",
  }),
  window: { from: "2026-08-15T00:00:00.000Z", to: "2026-11-12T00:00:00.000Z" },
  columns: ["path", "sitemap", "clicks"],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
  mocks.list.mockResolvedValue(
    pagesList(
      Array.from({ length: 121 }, (_, n) =>
        pageRow({ path: `/docs/${n}`, url: `https://example.com/docs/${n}` }),
      ),
    ),
  );
  mocks.sources.mockResolvedValue(connectedSources());
});
it("serializes all supplied rows with the authorized project and every current filter", async () => {
  const result = await exportProjectPagesCsv(request);
  expect(mocks.scope).toHaveBeenCalledWith(
    { id: "actor" },
    "read",
    "prj_1",
    { type: "project" },
    { allowReadOnly: true },
  );
  expect(mocks.list).toHaveBeenCalledWith(
    "project_1",
    expect.objectContaining({
      page: 3,
      period: { from: new Date(request.window.from), to: new Date(request.window.to) },
      pageSize: 50,
      search: "docs",
      tagId: "tag_docs",
      sitemapState: "not_listed",
      status: "new",
      source: "manual",
      cwv: "pass",
      indexGroup: "indexed",
      coverageState: "Submitted",
      sort: { by: "path", dir: "asc" },
    }),
  );
  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.rows).toBe(121);
  expect(result.csv.split("\n")).toHaveLength(122);
  expect(result.csv).toContain("/docs/120");
  expect(result.filename).toMatch(/^pages-prj-1-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
});
it("denies an actor outside the project before reading export data", async () => {
  mocks.scope.mockRejectedValue(new Error("Forbidden"));
  await expect(exportProjectPagesCsv(request)).rejects.toThrow("Forbidden");
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.sources).not.toHaveBeenCalled();
});
it("refuses an oversized view without returning a partial file", async () => {
  mocks.list.mockResolvedValue({
    ...pagesList([]),
    sitemapChecked: true,
    sitemapComplete: true,
    total: 5001,
  });
  expect(await exportProjectPagesCsv(request)).toEqual({ status: "too_large", limit: 5000 });
});
it("rejects forged or repeated columns before accessing the project", async () => {
  await expect(exportProjectPagesCsv({ ...request, columns: ["secret"] })).rejects.toThrow();
  await expect(exportProjectPagesCsv({ ...request, columns: ["path", "path"] })).rejects.toThrow();
  expect(mocks.scope).not.toHaveBeenCalled();
});

it("keeps the rendered date window when the export is clicked after UTC midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T00:01:00Z"));
  const result = await exportProjectPagesCsv(request);
  expect(mocks.list.mock.calls[0]?.[1].period).toEqual({
    from: new Date(request.window.from),
    to: new Date(request.window.to),
  });
  expect(result).toMatchObject({ filename: "pages-prj-1-2026-08-15-2026-11-12.csv" });
  vi.useRealTimers();
});
it("refuses a count/rows race that supplies 5001 rows with a smaller total", async () => {
  mocks.list.mockResolvedValue({
    ...pagesList([]),
    sitemapChecked: true,
    sitemapComplete: true,
    total: 10,
    rows: Array(5001).fill(pageRow()),
  });
  expect(await exportProjectPagesCsv(request)).toEqual({ status: "too_large", limit: 5000 });
});

it("rejects a forged date window outside the selected preset before reading", async () => {
  await expect(
    exportProjectPagesCsv({
      ...request,
      window: { ...request.window, from: "2026-08-14T00:00:00.000Z" },
    }),
  ).rejects.toThrow("displayed period");
  expect(mocks.scope).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
