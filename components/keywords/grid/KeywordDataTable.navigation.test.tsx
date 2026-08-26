import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordDataTable } from "./KeywordDataTable";
import type { KeywordGridViewport } from "./KeywordGridViewport";
import { pendingRows } from "./KeywordsGrid.test-helpers";

let viewportProps: ComponentProps<typeof KeywordGridViewport>;
vi.mock("./KeywordGridViewport", () => ({
  KeywordGridViewport: (props: ComponentProps<typeof KeywordGridViewport>) => {
    viewportProps = props;
    return <div data-testid="viewport" />;
  },
}));
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
      checkFailed={false}
      filterChips={[]}
      filterCount={0}
      listMode="flat-server"
      matchedTargetCount={100}
      onClearFilters={vi.fn()}
      onDismissFailure={vi.fn()}
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
      updateKeywordScheduleAction={vi.fn()}
    />,
  );
}

describe("KeywordDataTable query history", () => {
  beforeEach(() => {
    setNavigationState({ pathname: "/app/prj_1/rank-tracker", searchParams: { page: "2" } });
  });

  it("pushes pagination as a separate history entry", () => {
    setup();
    viewportProps.onPaginationModelChange?.({ page: 2, pageSize: 25 }, {} as never);
    expect(routerMock.push).toHaveBeenCalledWith(expect.stringContaining("page=3"));
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("pushes sorting as a separate history entry", () => {
    setup();
    viewportProps.onSortModelChange?.([{ field: "keyword", sort: "desc" }], {} as never);
    expect(routerMock.push).toHaveBeenCalledWith(
      expect.stringMatching(/sort=keyword.*dir=desc.*page=1/),
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
