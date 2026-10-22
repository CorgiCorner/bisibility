import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { RelevantPageRow } from "@/lib/providers/domain-overview-types";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { DomainOverviewPagesTable } from "./DomainOverviewPagesTable";
import { DomainOverviewResults } from "./DomainOverviewResults";
import { domainOverviewReportFixture } from "./fixtures";

const rows: RelevantPageRow[] = [
  {
    etv: 10,
    etvDeltaPct: 1,
    keywordCount: 30,
    path: "/page-a",
    topKeyword: "citrus",
    topKeywordPosition: 9,
  },
  {
    etv: 20,
    etvDeltaPct: 10,
    keywordCount: 20,
    path: "/page-b",
    topKeyword: "berry",
    topKeywordPosition: 5,
  },
  {
    etv: 30,
    etvDeltaPct: 30,
    keywordCount: 10,
    path: "/page-c",
    topKeyword: "apple",
    topKeywordPosition: 2,
  },
];

const pageResult = {
  consumedCount: 3,
  costCents: 0,
  rows,
  totalCount: 3,
};

function order() {
  return screen.getAllByTestId("domain-page-row").map((row) => {
    return within(row).getByText(/^\/page-/).textContent;
  });
}

function clickSort(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

it("shows only sourced page columns even when legacy rows contain unsupported values", () => {
  render(<DomainOverviewPagesTable result={pageResult} />);

  expect(screen.getAllByRole("button", { name: /^Sort / })).toHaveLength(3);
  for (const column of ["Top keyword", "Organic pos", "Traffic Δ"]) {
    expect(screen.queryByRole("button", { name: new RegExp(`^Sort ${column} `) })).toBeNull();
  }
  expect(screen.queryByText("citrus")).toBeNull();
  for (const row of screen.getAllByTestId("domain-page-row")) {
    expect(row.children).toHaveLength(3);
  }
});

it("sorts every page column and keeps header labels inside their cells", () => {
  render(<DomainOverviewPagesTable onLoadMore={() => undefined} result={pageResult} />);

  for (const name of [
    "Sort Page ascending",
    "Sort Est. traffic ascending",
    "Sort Keywords descending",
  ]) {
    const button = screen.getByRole("button", { name });
    const label = button.querySelector("span");
    if (!label) throw new Error("Expected a clipped header label");
    expect(button).toHaveClass("min-w-0", "max-w-full", "overflow-hidden", "w-full");
    expect(button.parentElement).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
    expect(label).toHaveClass("min-w-0", "truncate");
  }

  expect(order()).toEqual(["/page-c", "/page-b", "/page-a"]);
  clickSort("Sort Est. traffic ascending");
  expect(order()).toEqual(["/page-a", "/page-b", "/page-c"]);
  clickSort("Sort Est. traffic descending");
  expect(order()).toEqual(["/page-c", "/page-b", "/page-a"]);

  clickSort("Sort Page ascending");
  expect(order()).toEqual(["/page-a", "/page-b", "/page-c"]);
  clickSort("Sort Page descending");
  expect(order()).toEqual(["/page-c", "/page-b", "/page-a"]);

  clickSort("Sort Keywords descending");
  expect(order()).toEqual(["/page-a", "/page-b", "/page-c"]);
  clickSort("Sort Keywords ascending");
  expect(order()).toEqual(["/page-c", "/page-b", "/page-a"]);
});

it("keeps a page sort when results rerender with the same fetch time", () => {
  const pages = domainOverviewReportFixture.pages;
  if (!pages.ok) throw new Error("Page fixture must be available");
  const report = {
    ...domainOverviewReportFixture,
    pages: { ...pages, data: pageResult },
  };
  const props = {
    history: null,
    historyError: false,
    historyLoading: false,
    projectRef: "prj_1",
    report,
    tableError: null,
    tableFetchedCount: { keywords: 100, pages: 3 },
    tableHasMore: { keywords: false, pages: false },
    tableLoading: null,
  };
  const { rerender } = render(<DomainOverviewResults {...props} />);
  const header = screen.getByRole("button", { name: "Sort Page ascending" });
  expect(header).toHaveClass("overflow-hidden", "min-w-0", "max-w-full");
  expect(header.parentElement).toHaveClass("overflow-hidden", "min-w-0", "max-w-full");

  clickSort("Sort Page ascending");
  expect(order()).toEqual(["/page-a", "/page-b", "/page-c"]);
  rerender(<DomainOverviewResults {...props} report={{ ...report }} />);
  expect(order()).toEqual(["/page-a", "/page-b", "/page-c"]);
  expect(screen.getByRole("button", { name: "Sort Page descending" })).toHaveClass(
    "overflow-hidden",
  );
});
