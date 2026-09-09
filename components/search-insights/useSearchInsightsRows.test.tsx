import type { SearchInsightsRowsRequest } from "@/lib/actions/search-insights-rows";
import { ROWS_PAGE_LIMIT, SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { deferred, pageRows, queryRows, view } from "./search-insights-row-test-fixtures";
import { type UseSearchInsightsRowsInput, useSearchInsightsRows } from "./useSearchInsightsRows";

vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

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

async function expandAll(
  result: { current: ReturnType<typeof useSearchInsightsRows> },
  kind: "pages" | "queries",
) {
  await act(async () => result.current.expand(kind));
  await act(async () => result.current.expand(kind));
  await waitFor(() => expect(result.current.loading[kind]).toBe(false));
}

it("drops loaded rows when the canonical property changes with the same view identity", async () => {
  const initial = input({
    view: view({ pages: { rows: pageRows(50), total: 59 } }),
    loadRowsAction: vi.fn(async () => ({ kind: "pages" as const, rows: pageRows(9), total: 59 })),
  });
  const { result, rerender } = renderHook(useSearchInsightsRows, { initialProps: initial });

  await expandAll(result, "pages");
  expect(result.current.pages).toMatchObject({ show: "all", total: 59 });
  expect(result.current.pages.rows).toHaveLength(59);

  rerender({ ...initial, property: "sc-domain:archived.example.com" });
  expect(result.current.pages).toEqual({ rows: initial.view.pages.rows, show: 10, total: 59 });
});

it("shows the new window's rows after a period switch, not the previous window's", async () => {
  const initial = input({
    view: view({ queries: { rows: queryRows(50, "twentyeight"), total: 1_284 } }),
  });
  const { result, rerender } = renderHook(useSearchInsightsRows, { initialProps: initial });
  await act(async () => result.current.expand("queries"));
  expect(result.current.queries.show).toBe(50);
  expect(result.current.queries.rows[0].query).toBe("twentyeight 0");

  const currentView = view({
    queries: { rows: queryRows(12, "ninety"), total: 96 },
    trackedTexts: [],
  });
  rerender({ ...initial, period: "90", view: currentView });
  expect(result.current.queries).toEqual({ rows: currentView.queries.rows, show: 10, total: 96 });
  expect(result.current.queries.rows.some((row) => row.query.startsWith("twentyeight"))).toBe(
    false,
  );
});

it("stops a saturated window at the cap instead of paging the whole property in", async () => {
  const loadRowsAction = vi.fn<UseSearchInsightsRowsInput["loadRowsAction"]>(async (input) => {
    const request = input as SearchInsightsRowsRequest;
    return {
      kind: "queries" as const,
      rows: queryRows(request.limit).map((row, index) => ({
        ...row,
        clicks: 400,
        query: `paged query ${request.offset + index}`,
      })),
      total: 120_000,
      trackedTexts: [],
    };
  });
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({
      loadRowsAction,
      view: view({ queries: { rows: queryRows(50), total: 120_000 } }),
    }),
  });

  await expandAll(result, "queries");
  expect(result.current.queries.rows).toHaveLength(SEARCH_INSIGHTS_ROWS_CAP);
  expect(result.current.queries).toMatchObject({ show: "all", total: 120_000 });
  const asked = loadRowsAction.mock.calls.map(
    ([input]) => (input as SearchInsightsRowsRequest).limit,
  );
  expect(asked.reduce((sum, limit) => sum + limit, 0)).toBe(SEARCH_INSIGHTS_ROWS_CAP - 50);
  expect(asked.every((limit) => limit <= ROWS_PAGE_LIMIT)).toBe(true);
});

it("ignores a page that finishes after the canonical property changes", async () => {
  const pending = deferred<Awaited<ReturnType<UseSearchInsightsRowsInput["loadRowsAction"]>>>();
  const initial = input({
    loadRowsAction: vi.fn(() => pending.promise),
    view: view({ queries: { rows: queryRows(50, "old"), total: 51 } }),
  });
  const { result, rerender } = renderHook(useSearchInsightsRows, { initialProps: initial });
  await act(async () => result.current.expand("queries"));
  act(() => result.current.expand("queries"));
  expect(result.current.loading.queries).toBe(true);

  const currentView = view({ queries: { rows: queryRows(2, "current"), total: 2 } });
  rerender({ ...initial, property: "sc-domain:current.example.com", view: currentView });
  await act(async () => {
    pending.resolve({ kind: "queries", rows: queryRows(1, "late"), total: 51, trackedTexts: [] });
  });

  expect(result.current.queries).toEqual({ rows: currentView.queries.rows, show: 10, total: 2 });
  expect(result.current.loading.queries).toBe(false);
});

it("keeps the sorted rows when an earlier Show all response settles afterwards", async () => {
  const expansion = deferred<Awaited<ReturnType<UseSearchInsightsRowsInput["loadRowsAction"]>>>();
  const sorted = deferred<Awaited<ReturnType<UseSearchInsightsRowsInput["loadRowsAction"]>>>();
  const loadRowsAction = vi.fn<UseSearchInsightsRowsInput["loadRowsAction"]>((value) => {
    const request = value as SearchInsightsRowsRequest;
    if (request.sort?.key === "clicks" && request.offset === 50) return expansion.promise;
    return sorted.promise;
  });
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({
      loadRowsAction,
      view: view({ queries: { rows: queryRows(50, "initial query"), total: 80 } }),
    }),
  });
  await act(async () => result.current.expand("queries"));
  act(() => result.current.expand("queries"));
  expect(loadRowsAction).toHaveBeenCalledWith(
    expect.objectContaining({ offset: 50, sort: { direction: "desc", key: "clicks" } }),
  );
  act(() => result.current.sortBy("queries", "impressions"));
  expect(loadRowsAction).toHaveBeenCalledWith(
    expect.objectContaining({ offset: 0, sort: { direction: "desc", key: "impressions" } }),
  );
  const sortedRows = queryRows(50, "sorted query");
  await act(async () =>
    sorted.resolve({
      kind: "queries",
      rows: sortedRows,
      total: 80,
      trackedTexts: [],
    }),
  );
  expect(result.current.queries.rows).toEqual(sortedRows);
  await act(async () =>
    expansion.resolve({
      kind: "queries",
      rows: queryRows(30, "expanded query"),
      total: 80,
      trackedTexts: [],
    }),
  );
  expect(result.current.queries.rows).toEqual(sortedRows);
  expect(result.current.loading.queries).toBe(false);
});

it("flips the direction when the active column is asked for again", async () => {
  const loadRowsAction = vi.fn<UseSearchInsightsRowsInput["loadRowsAction"]>(async () => ({
    kind: "queries",
    rows: queryRows(10, "resorted query"),
    total: 80,
    trackedTexts: [],
  }));
  const { result } = renderHook(useSearchInsightsRows, {
    initialProps: input({
      loadRowsAction,
      view: view({ queries: { rows: queryRows(10), total: 80 } }),
    }),
  });
  for (const direction of ["asc", "desc"] as const) {
    await act(async () => result.current.sortBy("queries", "clicks"));
    expect(loadRowsAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: { direction, key: "clicks" } }),
    );
    expect(result.current.sort.queries).toEqual({ direction, key: "clicks" });
  }
});
