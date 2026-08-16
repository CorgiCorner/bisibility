import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { appPath } from "@/lib/routing/app-path";
import { stubBlobDownload } from "@/tests/blob-download";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pendingRows, renderPendingGrid } from "./KeywordsGrid.test-helpers";

const mocks = vi.hoisted(() => ({ exportKeywords: vi.fn() }));

vi.mock("@/lib/actions/keyword-import-export", () => ({ exportKeywords: mocks.exportKeywords }));
vi.mock("@/components/keywords/import/ImportCsvWizard", () => ({
  ImportCsvWizard: () => null,
}));
vi.mock("./DeferredDataGrid", async () => {
  const { MuiDataGrid } = await import("./MuiDataGrid");
  return {
    DeferredDataGrid: (props: Omit<ComponentProps<typeof MuiDataGrid>, "onReady">) => (
      <MuiDataGrid {...props} onReady={() => undefined} />
    ),
  };
});

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
    renderPendingGrid({ importTopQueriesAction, rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "Find Search Console queries" }));

    await waitFor(() =>
      expect(importTopQueriesAction).toHaveBeenCalledWith({ limit: 50, projectId: "prj_1" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Add 2 keywords/i }));

    expect(
      await screen.findByRole("textbox", { name: "Keywords" }, { timeout: 10_000 }),
    ).toHaveValue("open source rank tracker\nrank tracking for agencies");
  });

  it("labels the first completed observation as new", async () => {
    renderPendingGrid({
      providerConnected: true,
      rows: [{ ...keywordRows[0], positionBaseline: null, previousPosition: null }],
    });

    expect(await screen.findByText("New")).toHaveAttribute("aria-label", "First observation");
  });

  it("renders pending keywords in the normal management grid", async () => {
    renderPendingGrid();

    expect(screen.getByText("No rankings yet.")).toBeInTheDocument();
    expect(screen.getByText("2 keywords are ready for the first rank check.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect provider/i })).toHaveAttribute(
      "href",
      appPath("prj_1", "integrations"),
    );
    expect(screen.getByRole("radio", { name: /all device scope/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all keywords/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /columns/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add keyword/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /device/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /frequency/i })).toBeInTheDocument();
    expect(await screen.findByText(keywordRows[0].keyword)).toBeInTheDocument();
    expect(
      (await screen.findAllByText("Awaiting first check", {}, { timeout: 10000 })).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });

  it("labels a completed check with no result as not found in top 100", async () => {
    const [row] = pendingRows(1);
    renderPendingGrid({
      rows: [{ ...row, hasRankData: true, lastCheckStatus: "completed", position: 101 }],
    });

    expect(await screen.findByText("Not found in top 100")).toBeInTheDocument();
  });

  it("keeps filter clearing in the toolbar when visible rows are empty", async () => {
    renderPendingGrid({
      initialViewConfig: {
        filters: { ...emptyKeywordFilters, contains: "missing keyword" },
        lens: { device: "desktop", locationId: null },
        search: "",
        surface: "keywords",
        version: 1,
      },
      lens: { device: "desktop", locationId: null },
    });

    expect(
      await screen.findByText("No keywords match Desktop with 1 active filter"),
    ).toBeInTheDocument();
    expect(screen.getByText("Active filters")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /clear all/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /show all locations & devices/i }));

    expect(routerMock.push).toHaveBeenCalledWith(`${appPath("prj_1", "rank-tracker")}?device=all`);
    fireEvent.click(screen.getByRole("button", { name: /clear all search and filters/i }));
    expect(await screen.findByText(keywordRows[0].keyword)).toBeInTheDocument();
  });
});
