import { searchInsightsMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import type { SearchInsightsRowsRequest } from "@/lib/actions/search-insights-rows";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { deferred, pageRows, queryRows, view } from "./search-insights-row-test-fixtures";
import { type UseSearchInsightsRowsInput, useSearchInsightsRows } from "./useSearchInsightsRows";

const showToast = vi.fn();
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast }) }));

type RowsPage = Awaited<ReturnType<UseSearchInsightsRowsInput["loadRowsAction"]>>;

function SearchInsightsMessages({ children }: Readonly<{ children: ReactNode }>) {
  return searchInsightsMessagesElement(children);
}

function input(overrides: Partial<UseSearchInsightsRowsInput> = {}): UseSearchInsightsRowsInput {
  return {
    loadRowsAction: async () => ({ kind: "pages", rows: [], total: 0 }),
    period: "28",
    projectId: "prj_1",
    property: "sc-domain:example.com",
    view: view(),
    ...overrides,
  };
}

function queriesPage(rows: RowsPage["rows"], total: number): RowsPage {
  return { kind: "queries", rows: rows as never, total, trackedTexts: [] };
}

function lastRequest(loadRowsAction: ReturnType<typeof vi.fn>) {
  return loadRowsAction.mock.lastCall?.[0] as SearchInsightsRowsRequest;
}

afterEach(() => {
  vi.useRealTimers();
  showToast.mockReset();
});

it("opens each table on the first page the server view already holds", () => {
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({ view: view({ queries: { rows: queryRows(10), total: 1_284 } }) }),
    wrapper: SearchInsightsMessages,
  });
  expect(result.current.queries).toMatchObject({
    page: 1,
    pageSize: 10,
    search: "",
    sort: { direction: "desc", key: "clicks" },
    total: 1_284,
  });
  expect(result.current.queries.rows).toHaveLength(10);
});

it("reads one server page for a page change and replaces the rows on screen", async () => {
  const second = queryRows(10, "second page");
  const loadRowsAction = vi.fn(async () => queriesPage(second, 1_284));
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({
      loadRowsAction,
      view: view({ queries: { rows: queryRows(10), total: 1_284 } }),
    }),
    wrapper: SearchInsightsMessages,
  });

  await act(async () => result.current.paginate("queries", { page: 2, pageSize: 10 }));

  expect(lastRequest(loadRowsAction)).toMatchObject({ kind: "queries", limit: 10, offset: 10 });
  expect(result.current.queries).toMatchObject({ page: 2, rows: second, total: 1_284 });
  expect(result.current.loading.queries).toBe(false);
});

it("starts again from the first page when the page size changes", async () => {
  const loadRowsAction = vi.fn(async () => queriesPage(queryRows(25), 1_284));
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({ loadRowsAction }),
    wrapper: SearchInsightsMessages,
  });
  await act(async () => result.current.paginate("queries", { page: 4, pageSize: 10 }));
  await act(async () => result.current.paginate("queries", { page: 4, pageSize: 25 }));

  expect(lastRequest(loadRowsAction)).toMatchObject({ limit: 25, offset: 0 });
  expect(result.current.queries).toMatchObject({ page: 1, pageSize: 25 });
});

it("sends a new sort from the first page and flips the direction on a second ask", async () => {
  const loadRowsAction = vi.fn(async () => queriesPage(queryRows(10, "resorted"), 80));
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({ loadRowsAction }),
    wrapper: SearchInsightsMessages,
  });
  await act(async () => result.current.paginate("queries", { page: 3, pageSize: 10 }));
  for (const direction of ["asc", "desc"] as const) {
    await act(async () => result.current.sortBy("queries", "clicks"));
    expect(lastRequest(loadRowsAction)).toMatchObject({
      offset: 0,
      sort: { direction, key: "clicks" },
    });
    expect(result.current.queries).toMatchObject({ page: 1, sort: { direction, key: "clicks" } });
  }
});

it("shows the typed search at once and sends one read when the typing stops", async () => {
  vi.useFakeTimers();
  const loadRowsAction = vi.fn(async () => ({
    kind: "pages" as const,
    rows: pageRows(3),
    total: 3,
  }));
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({ loadRowsAction }),
    wrapper: SearchInsightsMessages,
  });

  act(() => result.current.search("pages", "gu"));
  act(() => result.current.search("pages", "guide"));
  expect(result.current.pages.search).toBe("guide");
  expect(loadRowsAction).not.toHaveBeenCalled();

  await act(async () => vi.runAllTimersAsync());
  expect(loadRowsAction).toHaveBeenCalledTimes(1);
  expect(lastRequest(loadRowsAction)).toMatchObject({ kind: "pages", offset: 0, search: "guide" });
  expect(result.current.pages).toMatchObject({ page: 1, total: 3 });
});

it("keeps the newest page when an older read settles after it", async () => {
  const older = deferred<RowsPage>();
  const newer = deferred<RowsPage>();
  const loadRowsAction = vi
    .fn<UseSearchInsightsRowsInput["loadRowsAction"]>()
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise);
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({ loadRowsAction }),
    wrapper: SearchInsightsMessages,
  });
  act(() => result.current.paginate("queries", { page: 2, pageSize: 10 }));
  act(() => result.current.paginate("queries", { page: 3, pageSize: 10 }));

  const third = queryRows(10, "third page");
  await act(async () => newer.resolve(queriesPage(third, 80)));
  await act(async () => older.resolve(queriesPage(queryRows(10, "second page"), 80)));

  expect(result.current.queries).toMatchObject({ page: 3, rows: third });
  expect(result.current.loading.queries).toBe(false);
});

it("drops a page that settles after the window or property changes", async () => {
  const pending = deferred<RowsPage>();
  const initial = input({ loadRowsAction: vi.fn(() => pending.promise) });
  const { result, rerender } = renderHook(useSearchInsightsRows, {
    initialProps: initial,
    wrapper: SearchInsightsMessages,
  });
  act(() => result.current.paginate("queries", { page: 2, pageSize: 10 }));
  expect(result.current.loading.queries).toBe(true);

  const currentView = view({ queries: { rows: queryRows(2, "current"), total: 2 } });
  rerender({ ...initial, property: "sc-domain:current.example.com", view: currentView });
  await act(async () => pending.resolve(queriesPage(queryRows(10, "late"), 51)));

  expect(result.current.queries).toMatchObject({ page: 1, rows: currentView.queries.rows });
  expect(result.current.loading.queries).toBe(false);
});

it("puts the last answered page back and says so when a read fails", async () => {
  const loadRowsAction = vi.fn(async () => {
    throw new Error("offline");
  });
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({ loadRowsAction }),
    wrapper: SearchInsightsMessages,
  });
  const before = result.current.queries.rows;

  await act(async () => result.current.paginate("queries", { page: 2, pageSize: 10 }));

  expect(result.current.queries).toMatchObject({ page: 1, rows: before });
  expect(showToast).toHaveBeenCalledWith(expect.any(String), { severity: "error" });
});
