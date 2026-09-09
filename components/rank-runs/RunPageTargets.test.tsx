import { appPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { runPageFixture } from "./RunPageFixtures";
import { runSummary } from "./RunPageModel";
import { RunPageTargets } from "./RunPageTargets";
import type { RunPageData, RunPageItem } from "./RunPageTypes";

type RenderOptions = {
  cursor?: string | null;
  items?: RunPageItem[];
  onFilter?: (filter: "all" | RunPageItem["status"]) => void;
  onLoadMore?: () => void;
  run?: RunPageData;
};

function summary(run: RunPageData) {
  return runSummary(run, { formatInstant: (instant) => instant, now: runPageFixture.now });
}

function renderTargets({
  cursor = runPageFixture.nextCursor,
  items = runPageFixture.items,
  onFilter = vi.fn(),
  onLoadMore = vi.fn(),
  run = runPageFixture.run,
}: RenderOptions = {}) {
  render(
    <RunPageTargets
      busy={null}
      canMutate
      cursor={cursor}
      filter="all"
      items={items}
      onCancel={vi.fn()}
      onFilter={onFilter}
      onLoadMore={onLoadMore}
      onMutate={vi.fn()}
      projectRef="prj_example"
      run={run}
      summary={summary(run)}
    />,
  );
}

describe("RunPageTargets", () => {
  it("uses an embedded compact DataTable with the parent Card as its only frame", () => {
    renderTargets();

    const table = screen.getByRole("table", { name: "Targets in this run" });
    const section = screen.getByRole("heading", { name: "Targets in this run" }).closest("section");

    expect(section).toHaveClass("[&>[role=table]]:border-0");
    expect(table.parentElement).toBe(section);
    expect(table).toHaveAttribute("data-layout", "auto");
    expect(table).toHaveClass("border", "border-border");
    expect(screen.getByRole("columnheader", { name: /^Keyword\b/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /^Position\b/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "alpha cms" })).toHaveAttribute(
      "href",
      appPath("prj_example", "rank-tracker", "kw_alpha"),
    );
    expect(screen.queryByRole("button", { name: /Sort / })).toBeNull();
  });

  it("keeps target filtering outside the table primitive", () => {
    const onFilter = vi.fn();
    renderTargets({ onFilter });

    fireEvent.click(screen.getByLabelText("Skipped"));

    expect(onFilter).toHaveBeenCalledWith("skipped");
  });

  it("keeps load more outside the table when an audit run has another page", () => {
    const onLoadMore = vi.fn();
    const run = {
      ...runPageFixture.run,
      outcome: "succeeded" as const,
      status: "completed" as const,
    };
    renderTargets({ onLoadMore, run });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("retains the no-target copy inside the table", () => {
    renderTargets({ items: [] });

    expect(screen.getByText("Nothing was sent.")).toBeInTheDocument();
    expect(screen.getByText("0 targets")).toBeInTheDocument();
  });

  it("maps an unrunnable cancelled target reason before rendering its status note", () => {
    renderTargets({
      items: [
        {
          ...runPageFixture.items[0],
          blockedReason: "market_inactive",
          id: "cancelled-market",
          rankCheck: null,
          status: "cancelled",
        },
      ],
    });

    expect(screen.getByRole("columnheader", { name: /^Note\b/ })).toBeInTheDocument();
    expect(screen.getByText("Market not active")).toBeInTheDocument();
    expect(screen.queryByText("market_inactive")).toBeNull();
  });
});
