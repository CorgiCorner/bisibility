import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { appPath } from "@/lib/routing/app-path";
import { stubBlobDownload } from "@/tests/blob-download";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pendingRows, renderPendingGrid } from "./KeywordsGrid.test-helpers";

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
  it("keeps the keyword table and pagination within the workspace viewport", () => {
    renderPendingGrid({ providerConnected: true, rows: [keywordRows[0]] });

    expect(screen.getByTestId("keywords-grid-viewport")).toHaveClass(
      "h-[650px]",
      "min-h-[420px]",
      "max-h-[calc(100dvh-200px)]",
    );
  });

  it("picks Search Console suggestions then opens the add drawer with them joined", async () => {
    const importTopQueriesAction = vi.fn(async () => ({
      hidden: [],
      hiddenCount: 0,
      queries: ["open source rank tracker", "rank tracking for agencies"],
      suggestions: [{ query: "open source rank tracker" }, { query: "rank tracking for agencies" }],
    }));
    renderPendingGrid({
      importTopQueriesAction,
      rows: [],
      searchConsoleConnected: true,
      totalCount: 0,
    });

    fireEvent.click(screen.getByRole("button", { name: "From Search Console" }));

    await waitFor(() =>
      expect(importTopQueriesAction).toHaveBeenCalledWith({ limit: 50, projectId: "prj_1" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Add 2 keywords/i }));

    expect(
      await screen.findByRole("textbox", { name: "Keywords" }, { timeout: 10_000 }),
    ).toHaveValue("open source rank tracker\nrank tracking for agencies");
  }, 15_000);

  it("labels the first completed observation as new", async () => {
    renderPendingGrid({
      providerConnected: true,
      rows: [{ ...keywordRows[0], positionBaseline: null, previousPosition: null }],
    });

    expect(await screen.findByText("New")).toHaveAttribute("aria-label", "First observation");
  });

  it("renders pending keywords in the normal management grid", async () => {
    renderPendingGrid();

    expect(screen.getByText("No rankings yet")).toBeInTheDocument();
    expect(screen.getByText("2 keywords are ready for the first rank check.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect provider/i })).toHaveAttribute(
      "href",
      appPath("prj_1", "integrations"),
    );
    expect(screen.getByRole("radio", { name: /all device scope/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all keywords/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /columns/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    expect(
      within(screen.getByTestId("keywords-import-action")).getByRole("button", {
        name: /^Import$/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add keyword/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /device/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /schedule/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sort Position descending" }));
    expect(routerMock.push).toHaveBeenCalledWith(expect.stringMatching(/dir=desc.*page=1/));
    expect(screen.getByRole("columnheader", { name: /Position/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(await screen.findByText(keywordRows[0].keyword)).toBeInTheDocument();
    expect(
      await screen.findAllByRole("cell", { name: "Not checked" }, { timeout: 10_000 }),
    ).toHaveLength(2);
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  }, 15_000);

  it("labels a completed check with no result as not found in top 100", async () => {
    const [row] = pendingRows(1);
    renderPendingGrid({
      rows: [{ ...row, hasRankData: true, lastCheckStatus: "completed", position: 101 }],
    });

    expect(await screen.findByText("Not found in top 100")).toBeInTheDocument();
  });

  it("refreshes RSC data without navigating or clearing table search state", () => {
    renderPendingGrid();

    const search = screen.getByRole("searchbox", { name: "Search keywords" });
    fireEvent.change(search, { target: { value: "rank tracker" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh table" }));

    expect(routerMock.refresh).toHaveBeenCalledOnce();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(search).toHaveValue("rank tracker");
  });

  it("passes the supplied initial density to the grid", () => {
    renderPendingGrid({ initialDensity: "compact" });

    expect(screen.getByRole("button", { name: "Table density" })).toHaveTextContent("Compact");
  });

  it("persists density changes to a cookie and keeps the selection", () => {
    renderPendingGrid({ initialDensity: "standard" });

    fireEvent.click(screen.getByRole("button", { name: "Table density" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Compact" }));

    expect(document.cookie).toContain("pref_density=compact");
    expect(screen.getByRole("button", { name: "Table density" })).toHaveTextContent("Compact");
  });

  it("commits server search on Enter without navigating on each keystroke", () => {
    renderPendingGrid({
      matchedTargetCount: 100,
      page: 3,
      pageCount: 3,
      pageSize: 25,
      query: {
        filters: { ...emptyKeywordFilters },
        grouped: false,
        lens: { device: "desktop", locationId: null },
        page: 3,
        pageSize: 25,
        savedViewId: null,
        search: "",
        sort: { direction: "asc", field: "position" },
      },
      totalCount: 2,
    });
    const search = screen.getByRole("searchbox", { name: "Search keywords" });
    fireEvent.change(search, { target: { value: "rank" } });
    expect(routerMock.push).not.toHaveBeenCalledWith(expect.stringContaining("q=rank"));
    fireEvent.click(screen.getByRole("radio", { name: /mobile device scope/i }));
    expect(routerMock.push).toHaveBeenLastCalledWith(
      expect.stringMatching(/q=rank.*device=mobile.*page=1/),
    );
    const callsAfterScope = routerMock.push.mock.calls.length;
    fireEvent.keyDown(search, { key: "Enter" });
    expect(routerMock.push).toHaveBeenCalledTimes(callsAfterScope);
  });

  it("submits the canonical flat query instead of current-page IDs", async () => {
    const query = {
      filters: { ...emptyKeywordFilters, wrongUrl: true },
      grouped: false,
      lens: { device: "desktop" as const, locationId: null },
      page: 3,
      pageSize: 25 as const,
      savedViewId: null,
      search: "rank",
      sort: { direction: "asc" as const, field: "position" as const },
    };
    renderPendingGrid({
      matchedTargetCount: 80,
      page: 3,
      pageCount: 4,
      pageSize: 25,
      query,
      totalCount: 100,
    });
    fireEvent.click(
      within(screen.getByTestId("keywords-export-action")).getByRole("button", {
        name: /^Export$/i,
      }),
    );
    expect(await screen.findByText("Export 80 filtered keywords")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() =>
      expect(mocks.exportKeywords).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "prj_1",
          selection: { mode: "query", query },
        }),
      ),
    );
    expect(mocks.exportKeywords.mock.calls[0]?.[0]).not.toHaveProperty("keywordIds");
  });

  it("pushes consecutive deliberate search and lens transitions", () => {
    renderPendingGrid({
      matchedTargetCount: 100,
      page: 3,
      pageCount: 4,
      pageSize: 25,
      totalCount: 100,
      query: {
        filters: { ...emptyKeywordFilters },
        grouped: false,
        lens: { device: "desktop", locationId: null },
        page: 3,
        pageSize: 25,
        savedViewId: null,
        search: "",
        sort: { direction: "asc", field: "position" },
      },
    });
    const search = screen.getByRole("searchbox", { name: "Search keywords" });
    fireEvent.change(search, { target: { value: "first" } });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.click(screen.getByRole("radio", { name: /mobile device scope/i }));

    expect(routerMock.push).toHaveBeenCalledTimes(2);
    expect(routerMock.push.mock.calls[0]?.[0]).toContain("q=first");
    expect(routerMock.push.mock.calls[1]?.[0]).toContain("device=mobile");
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
