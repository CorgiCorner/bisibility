import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BacklinksTable, type BacklinksTableProps } from "./BacklinksTable";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";

const now = new Date("2026-07-24T12:00:00.000Z");

function renderTable(overrides: Partial<BacklinksTableProps> = {}) {
  return render(
    <BacklinksTable
      fetchedRowCount={backlinksSnapshotFixture.fetchedRowCount}
      now={now}
      rows={backlinksSnapshotFixture.rows}
      target={backlinksSnapshotFixture.target}
      totalDomains={backlinksSnapshotFixture.summary.referringDomainsTotal}
      totalRowsAvailable={backlinksSnapshotFixture.totalRowsAvailable}
      {...overrides}
    />,
  );
}

describe("BacklinksTable", () => {
  it("renders semantic view tabs and domain-count filter chips", () => {
    renderTable();

    const tablist = screen.getByRole("tablist", { name: "Backlinks views" });
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveClass("flex-wrap");
    expect(tablist).not.toHaveClass("overflow-x-auto");
    expect(screen.getByRole("tab", { name: "Backlinks" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("radio", { name: "One per domain" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "All links" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /All 48 domains/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New 30d 3 domains/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lost 30d 1 domain/ })).toBeInTheDocument();
  });

  it("expands domains, collapses identical runs, and reveals all rows", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Expand toolindex.app" }));
    expect(screen.getByText("34 more pages carry the same footer link")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.queryByText("34 more pages carry the same footer link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse toolindex.app" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("operates expandable rows from the keyboard", async () => {
    const user = userEvent.setup();
    renderTable();

    screen.getByRole("button", { name: "Expand deskreview.io" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Collapse deskreview.io" })).toBeInTheDocument();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Expand deskreview.io" })).toBeInTheDocument();
  });

  it("dims and strikes lost domains and renders the lost-date pill", () => {
    renderTable();

    const source = screen.getByText("designweekly.co");
    const lostRow = source.closest("button");
    expect(lostRow).toHaveAttribute("data-status", "lost");
    expect(lostRow).toHaveClass("text-fg-muted");
    expect(source).toHaveClass("line-through");
    expect(within(lostRow as HTMLElement).getByText("lost 12 Jul")).toBeInTheDocument();
  });

  it("turns spam values amber at the 5 point threshold", () => {
    renderTable();

    expect(screen.getByText("6.0")).toHaveClass("text-yellow-text");
    expect(screen.getByText("4.0")).not.toHaveClass("text-yellow-text");
  });

  it.each([
    ["Referring domains", "Referring domain view within fetched rows (100 of 1,685)"],
    ["Top pages", "Top page view within fetched rows (100 of 1,685)"],
    ["Anchors", "Anchor view within fetched rows (100 of 1,685)"],
  ])("labels the %s aggregation as within fetched rows", (tab, label) => {
    renderTable();

    fireEvent.click(screen.getByRole("tab", { name: tab }));
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders the binding positive empty state for broken backlinks", () => {
    renderTable({ onLoadMore: vi.fn() });

    fireEvent.click(screen.getByRole("button", { name: /^Broken 0$/ }));
    expect(screen.getByText("No broken backlinks")).toBeInTheDocument();
    expect(
      screen.getByText(/Every URL that other sites link to currently returns a 200/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load 100 more/ })).not.toBeInTheDocument();
  });

  it("loads and appends 100 more backlink rows", async () => {
    const appended = {
      ...backlinksSnapshotFixture.rows[0],
      sourceDomain: "loaded.example",
      sourceUrl: "https://loaded.example/review",
    };
    const onLoadMore = vi.fn(async () => ({
      ...backlinksSnapshotFixture,
      costCents: 1,
      fetchedRowCount: 200,
      rows: [appended],
    }));
    renderTable({ loadMoreEstimateCents: 1, onLoadMore });

    fireEvent.click(screen.getByRole("button", { name: "Load 100 more ~$0.01" }));

    await waitFor(() => expect(onLoadMore).toHaveBeenCalledOnce());
    expect(await screen.findByText("loaded.example")).toBeInTheDocument();
    expect(screen.getByText("Fetched 200 of 1,685 links")).toBeInTheDocument();
  });
});
