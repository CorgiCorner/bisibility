import { setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pendingRows, renderPendingGrid } from "./KeywordsGrid.test-helpers";

const toolbarName = "Actions for selected keywords";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setNavigationState({ pathname: "/app/prj_1/rank-tracker" });
  stubResizeObserver();
});

function selectRow(keyword: string) {
  const row = screen.getByText(keyword).closest('[role="row"]') as HTMLElement;
  fireEvent.click(within(row).getByRole("checkbox"));
}

describe("KeywordDataTable selection bar", () => {
  it("floats the selection actions without moving the table", async () => {
    const rows = pendingRows(2);
    renderPendingGrid({ rows });
    await screen.findByText(rows[0].keyword);
    const table = screen.getByTestId("rank-tracker-keywords");
    const card = table.closest('[data-slot="card"]') as HTMLElement;
    const filterBar = card.firstElementChild as HTMLElement;
    const afterFilterBar = filterBar.nextElementSibling;
    const cardChildren = [...card.children];

    expect(screen.queryByRole("toolbar", { name: toolbarName })).not.toBeInTheDocument();
    expect(document.querySelector("[data-floating-selection-spacer]")).toBeNull();

    selectRow(rows[0].keyword);

    const bar = screen.getByRole("toolbar", { name: toolbarName });
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();
    expect(card.contains(bar)).toBe(false);
    expect(bar.closest("[data-floating-selection-bar]")).toHaveClass("fixed");
    expect(filterBar.nextElementSibling).toBe(afterFilterBar);
    expect([...card.children]).toEqual(cardChildren);
    expect(document.querySelector("[data-floating-selection-spacer]")).not.toBeNull();

    fireEvent.click(within(bar).getByRole("button", { name: "Clear" }));

    expect(screen.queryByRole("toolbar", { name: toolbarName })).not.toBeInTheDocument();
    expect(document.querySelector("[data-floating-selection-spacer]")).toBeNull();
  });

  it("opens the run-check depth menu upward from the bottom bar", async () => {
    const rows = pendingRows(1);
    renderPendingGrid({ providerConnected: true, rows });
    await screen.findByText(rows[0].keyword);
    selectRow(rows[0].keyword);

    const bar = screen.getByRole("toolbar", { name: toolbarName });
    fireEvent.click(within(bar).getByRole("button", { name: "Choose check depth" }));

    const menu = await screen.findByRole("menu");
    expect(menu.closest("[data-side]") ?? menu).toHaveAttribute("data-side", "top");
  });
});
