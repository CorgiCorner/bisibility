import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import { setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordDataTable } from "./KeywordDataTable";
import { pendingRows } from "./KeywordsGrid.test-helpers";

vi.mock("./KeywordsFilterBar", () => ({ KeywordsFilterBar: () => null }));
vi.mock("./BulkActionBar", () => ({ BulkActionBar: () => null }));
const rows = pendingRows(2);
const props: ComponentProps<typeof KeywordDataTable> = {
  bulkClearTargetAction: vi.fn(),
  bulkDeleteAction: vi.fn(),
  bulkSetFrequencyAction: vi.fn(),
  bulkSetTargetAction: vi.fn(),
  bulkTagAction: vi.fn(),
  canDeleteKeyword: false,
  canUpdateKeyword: true,
  filterChips: [],
  filterCount: 0,
  matchedTargetCount: 3,
  pageCount: 1,
  page: 1,
  pageSize: 25,
  onClearFilters: vi.fn(),
  onOpenExport: vi.fn(),
  onOpenFilters: vi.fn(),
  onRemoveFilter: vi.fn(),
  onRunChecks: vi.fn(),
  onSearchChange: vi.fn(),
  pendingCheckIds: new Set(),
  projectId: "prj_1",
  query: {
    filters: emptyKeywordFilters,
    grouped: false,
    lens: { device: "all", locationId: null },
    page: 1,
    pageSize: 25,
    savedViewId: null,
    search: "",
    sort: { field: "position", direction: "asc" },
  },
  rows,
  searchValue: "",
  updateKeywordAction: vi.fn(),
};
function grid(
  nextRows = rows,
  version = 0,
  query = props.query,
  aiOverview?: ComponentProps<typeof KeywordDataTable>["aiOverview"],
) {
  return (
    <AppRealtimeContext.Provider
      value={{ notifications: null, operations: [], status: "live", rankDataVersion: version }}
    >
      <KeywordDataTable {...props} rows={nextRows} query={query} aiOverview={aiOverview} />
    </AppRealtimeContext.Provider>
  );
}
function bodyKeywords() {
  return [
    ...screen
      .getByTestId("rank-tracker-keywords-body")
      .querySelectorAll('[role="row"][data-depth="0"]'),
  ].map(
    (row) => rows.find((candidate) => row.textContent?.includes(candidate.keyword))?.id ?? "new",
  );
}
beforeEach(() => {
  localStorage.clear();
  setNavigationState({ pathname: "/app/prj_1/rank-tracker" });
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(650);
});
afterEach(() => vi.restoreAllMocks());
describe("keyword realtime banner", () => {
  it.each([false, true])(
    "keeps rows under the cursor and selection when realtime adds=%s; show applies order and focus",
    (add) => {
      const view = render(grid());
      const first = screen.getByText(rows[0].keyword).closest('[role="row"]') as HTMLElement;
      fireEvent.click(within(first).getByRole("checkbox"));
      const before = bodyKeywords();
      const incoming = [
        rows[1],
        rows[0],
        ...(add ? [{ ...rows[0], id: "new", keyword: "fresh result" }] : []),
      ];
      const viewport = screen.getByTestId("keywords-grid-viewport");
      viewport.scrollTop = 120;
      view.rerender(grid(incoming, 1));
      expect(bodyKeywords()).toEqual(before);
      expect(first).toBeInTheDocument();
      expect(viewport).toBeInTheDocument();
      expect(within(first).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
      expect(viewport.scrollTop).toBe(120);
      fireEvent.click(screen.getByRole("button", { name: "Show" }));
      expect(bodyKeywords()).toEqual([rows[1].id, rows[0].id, ...(add ? ["new"] : [])]);
      expect(document.activeElement).toHaveAttribute("aria-label", "Rank tracker keywords");
      expect(screen.queryByText("New results")).toBeNull();
    },
  );
  it("updates existing row values in place without a banner", () => {
    const view = render(grid());
    view.rerender(grid([{ ...rows[0], keyword: "updated keyword" }, rows[1]], 1));
    expect(screen.getByText("updated keyword")).toBeVisible();
    expect(screen.queryByText("New results")).toBeNull();
  });
  it("keeps an open edit and unsaved input through a held update", async () => {
    const view = render(grid());
    fireEvent.click(screen.getAllByRole("button", { name: "Keyword actions" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit keyword" }));
    const input = await screen.findByRole("textbox", { name: "Keyword" }, { timeout: 8_000 });
    fireEvent.change(input, { target: { value: "unsaved draft" } });
    view.rerender(grid([rows[1], rows[0]], 1));
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("unsaved draft");
    expect(screen.getByText("New results")).toBeInTheDocument();
  }, 10_000);
  it.each(["sort", "filter", "pagination"])("applies user %s immediately", (kind) => {
    const view = render(grid());
    view.rerender(grid([rows[1], rows[0]], 1));
    const query = {
      ...props.query,
      ...(kind === "sort"
        ? { sort: { field: "position" as const, direction: "desc" as const } }
        : {}),
      ...(kind === "filter" ? { search: "changed" } : {}),
      ...(kind === "pagination" ? { page: 2 } : {}),
    };
    view.rerender(grid([rows[1], rows[0]], 1, query));
    expect(bodyKeywords()).toEqual([rows[1].id, rows[0].id]);
    expect(screen.queryByText("New results")).toBeNull();
  });
});

it("switches AI Overview columns and facts on server re-render, then restores the normal view", () => {
  const view = render(grid());
  expect(screen.queryByRole("columnheader", { name: "AI Overview" })).not.toBeInTheDocument();
  const fact = {
    keywordId: rows[0].id,
    checkedAt: "2026-11-09T00:00:00.000Z",
    citedPath: null,
    citation: {
      shown: true,
      cited: false,
      citedPosition: null,
      citedUrl: null,
      sourceCount: 0,
      complete: true,
    },
    overview: { present: true, paragraphs: ["Retained answer"], sources: [] },
  };
  view.rerender(grid(rows, 0, props.query, { facts: [fact] }));
  expect(screen.getByRole("columnheader", { name: "AI Overview" })).toBeInTheDocument();
  expect(screen.getByText("Shown")).toBeInTheDocument();
  view.rerender(
    grid(rows, 0, props.query, {
      facts: [{ ...fact, citation: { ...fact.citation, shown: false }, overview: null }],
    }),
  );
  expect(screen.getByText("Not shown")).toBeInTheDocument();
  expect(screen.queryByText("Shown")).not.toBeInTheDocument();
  view.rerender(grid());
  expect(screen.queryByRole("columnheader", { name: "AI Overview" })).not.toBeInTheDocument();
});
