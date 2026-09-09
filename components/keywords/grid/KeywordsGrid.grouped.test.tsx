import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { appPath } from "@/lib/routing/app-path";
import { stubBlobDownload } from "@/tests/blob-download";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupedPendingRows, renderPendingGrid } from "./KeywordsGrid.test-helpers";

const mocks = vi.hoisted(() => ({ exportKeywords: vi.fn() }));

vi.mock("@/lib/actions/keyword-export-action", () => ({ exportKeywords: mocks.exportKeywords }));
vi.mock("@/components/keywords/import/ImportCsvWizard", () => ({
  ImportCsvWizard: () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  setNavigationState({ pathname: "/app/rank-tracker" });
  mocks.exportKeywords.mockResolvedValue({
    content: "keyword\n",
    count: 1,
    encoding: "utf8",
    filename: "keywords.csv",
    mimeType: "text/csv",
  });
  stubResizeObserver();
  stubBlobDownload();
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie reset mirrors the browser contract.
  document.cookie = "pref_density=; path=/; max-age=0";
});

describe("KeywordsGrid pending state", () => {
  it("clears explicit search and filters once while preserving the server lens and grouping", () => {
    setNavigationState({
      pathname: "/app/prj_1/rank-tracker",
      searchParams: {
        contains: "missing keyword",
        device: "mobile",
        grouped: "1",
        page: "3",
        q: "committed search",
      },
    });
    renderPendingGrid({
      matchedGroupCount: 4,
      matchedTargetCount: 100,
      page: 3,
      pageCount: 4,
      query: {
        filters: { ...emptyKeywordFilters, contains: "missing keyword" },
        grouped: true,
        lens: { device: "mobile", locationId: null },
        page: 3,
        pageSize: 25,
        savedViewId: null,
        search: "committed search",
        sort: { direction: "asc", field: "position" },
      },
      rows: groupedPendingRows(),
      totalCount: 2,
    });

    const search = screen.getByRole("searchbox", { name: "Search keywords" });
    fireEvent.change(search, { target: { value: "draft search" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all search and filters" }));

    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(search).toHaveValue("");
    const params = new URL(String(routerMock.push.mock.calls[0]?.[0]), "https://example.com")
      .searchParams;
    expect(params.get("q")).toBe("");
    expect(params.get("contains")).toBe("");
    expect(params.get("page")).toBe("1");
    expect(params.get("device")).toBe("mobile");
    expect(params.get("grouped")).toBe("1");
  });

  it("expands market groups and selects their leaf targets without navigating", async () => {
    const rows = groupedPendingRows();
    renderPendingGrid({
      matchedGroupCount: 1,
      query: {
        filters: emptyKeywordFilters,
        grouped: true,
        lens: { device: "all", locationId: null },
        page: 1,
        pageSize: 25,
        savedViewId: null,
        search: "",
        sort: { direction: "asc", field: "position" },
      },
      rows,
    });

    const toggle = await screen.findByRole("button", { name: `Expand ${rows[0]?.keyword}` });
    const groupRow = toggle.closest('[role="row"]') as HTMLElement;
    fireEvent.click(within(groupRow).getByRole("checkbox"));

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
    fireEvent.click(toggle);

    const table = screen.getByTestId("rank-tracker-keywords");
    let children = table.querySelectorAll<HTMLElement>('[role="row"][data-depth="1"]');
    expect(children).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: `Collapse ${rows[0]?.keyword}` }));
    expect(table.querySelectorAll('[role="row"][data-depth="1"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: `Expand ${rows[0]?.keyword}` }));
    children = screen
      .getByTestId("rank-tracker-keywords")
      .querySelectorAll<HTMLElement>('[role="row"][data-depth="1"]');
    fireEvent.click(children[0] as HTMLElement);
    const detailPaths = rows[0]?.subRows?.map((row) => appPath("prj_1", "rank-tracker", row.id));
    expect(detailPaths).toContain(routerMock.push.mock.calls.at(-1)?.[0]);
    fireEvent.click(screen.getByRole("radio", { name: "Flat" }));
    expect(routerMock.push).toHaveBeenLastCalledWith(expect.stringMatching(/page=1.*grouped=0/));
  });
});
