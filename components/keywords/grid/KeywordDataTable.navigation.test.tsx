import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordDataTable } from "./KeywordDataTable";
import { pendingRows } from "./KeywordsGrid.test-helpers";

vi.mock("./KeywordsFilterBar", () => ({
  KeywordsFilterBar: (props: { groupingControl?: React.ReactNode }) => <>{props.groupingControl}</>,
}));
vi.mock("./BulkActionBar", () => ({ BulkActionBar: () => null }));

const query = {
  filters: { ...emptyKeywordFilters },
  grouped: false,
  lens: { device: "desktop" as const, locationId: null },
  page: 2,
  pageSize: 25 as const,
  savedViewId: null,
  search: "",
  sort: { direction: "asc" as const, field: "position" as const },
};
function setup() {
  render(
    <KeywordDataTable
      bulkClearTargetAction={vi.fn()}
      bulkDeleteAction={vi.fn()}
      bulkSetFrequencyAction={vi.fn()}
      bulkSetTargetAction={vi.fn()}
      bulkTagAction={vi.fn()}
      canDeleteKeyword={false}
      canUpdateKeyword={false}
      checkHealth={{
        budget: { capCents: 5000, exhausted: false, spentCents: 0 },
        failed24h: {
          count: 1,
          latest: {
            error: null,
            errorCode: "provider_billing",
            keyword: "test",
            provider: "dataforseo",
          },
        },
        providerRate: { overrideCents: null, providerId: "dataforseo" },
      }}
      filterChips={[]}
      filterCount={0}
      matchedTargetCount={100}
      pageCount={4}
      onClearFilters={vi.fn()}
      onOpenExport={vi.fn()}
      onOpenFilters={vi.fn()}
      onRemoveFilter={vi.fn()}
      onRunChecks={vi.fn()}
      onSearchChange={vi.fn()}
      page={2}
      pageSize={25}
      pendingCheckIds={new Set()}
      projectId="prj_1"
      query={query}
      rows={pendingRows(1)}
      searchValue=""
      updateKeywordAction={vi.fn()}
    />,
  );
}

describe("KeywordDataTable query history", () => {
  beforeEach(() => {
    setNavigationState({ pathname: "/app/prj_1/rank-tracker", searchParams: { page: "2" } });
    stubResizeObserver();
  });

  it("does not show historical check failures or their retry action above keywords", () => {
    setup();
    expect(screen.queryByText(/failed in the last 24 hours/)).not.toBeInTheDocument();
    expect(screen.queryByText(/insufficient funds/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("pushes pagination as a separate history entry", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(routerMock.push).toHaveBeenCalledWith(expect.stringContaining("page=3"));
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("offers only the Rank Tracker page sizes and resets to page one", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Rows per page" }));

    const menu = within(screen.getByRole("menu"));
    expect(menu.queryByText("10", { exact: true })).not.toBeInTheDocument();
    expect(menu.queryByText("250", { exact: true })).not.toBeInTheDocument();
    expect(menu.getByText("25", { exact: true })).toBeInTheDocument();
    expect(menu.getByText("50", { exact: true })).toBeInTheDocument();
    fireEvent.click(menu.getByText("100", { exact: true }));

    const params = new URL(String(routerMock.push.mock.calls.at(-1)?.[0]), "https://example.com")
      .searchParams;
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("100");
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("pushes sorting as a separate history entry", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort Position descending" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      expect.stringMatching(/sort=position.*dir=desc.*page=1/),
    );
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("pushes grouping as a separate history entry", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Grouped" }));
    expect(routerMock.push).toHaveBeenCalledWith(expect.stringMatching(/page=1.*grouped=1/));
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
