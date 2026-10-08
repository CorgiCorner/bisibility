import { composeStories } from "@storybook/react";
import { within } from "@testing-library/dom";
import { expect, userEvent, waitFor } from "storybook/test";
import { describe, it } from "vitest";
import preview from "../.storybook/preview";
import * as storyModule from "../components/ui/data-table/DataTable.stories";
import * as columnStoryModule from "../components/ui/data-table/DataTableColumns.stories";

const stories = composeStories(storyModule, preview);
const columnStories = composeStories(columnStoryModule, preview);

function expectColumnBoundaries(table: HTMLElement) {
  for (const header of table.querySelectorAll<HTMLElement>('[role="columnheader"]')) {
    const cells = table.querySelectorAll<HTMLElement>(
      `[role="cell"][data-column-id="${header.dataset.columnId}"]`,
    );
    const bounds = header.getBoundingClientRect();
    for (const cell of cells) {
      expect(cell.getBoundingClientRect().left).toBeCloseTo(bounds.left, 1);
      expect(cell.getBoundingClientRect().width).toBeCloseTo(bounds.width, 1);
    }
    const handle = header.querySelector<HTMLElement>('hr[aria-orientation="vertical"]');
    if (handle) {
      expect(handle.getBoundingClientRect().right).toBeCloseTo(bounds.right, 1);
    }
  }
}

function expectPinnedHeadersCoverHandles(table: HTMLElement) {
  for (const header of table.querySelectorAll<HTMLElement>('[role="columnheader"]')) {
    if (getComputedStyle(header).position !== "sticky") continue;
    const bounds = header.getBoundingClientRect();
    const viewport = table.getBoundingClientRect();
    const end = Math.min(bounds.right - 12, viewport.right - 1, window.innerWidth);
    for (let x = Math.max(bounds.left + 2, viewport.left + 1, 0); x < end; x += 3) {
      const front = document.elementFromPoint(x, bounds.top + bounds.height / 2);
      const coveringHeader = front?.closest<HTMLElement>('[role="columnheader"]');
      // Narrow viewports can make the left and right pinned groups overlap.
      expect(
        header.contains(front) ||
          (coveringHeader && getComputedStyle(coveringHeader).position === "sticky"),
        `${header.dataset.columnId} at ${x},${bounds.top + bounds.height / 2}: ${front?.tagName} ${front?.getAttribute("aria-label")} ${front?.closest("[data-column-id]")?.getAttribute("data-column-id")}`,
      ).toBe(true);
    }
  }
}

describe("DataTable column boundaries", () => {
  it("keeps reordered and repinned headers aligned after hiding and resizing a column", async () => {
    const Story = columnStories.ReorderedAndRepinned;
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    try {
      await Story.run({ canvasElement });
      const canvas = within(canvasElement);
      const table = canvas.getByRole("table");
      const ids = [...table.querySelectorAll<HTMLElement>('[role="columnheader"]')].map(
        (header) => header.dataset.columnId,
      );
      expect(ids).toEqual([
        "selection",
        "device",
        "keyword",
        "ctr",
        "impressions",
        "clicks",
        "position",
        "volume",
        "actions",
      ]);
      const handle = canvas.getByRole("separator", { name: "Resize Position column" });
      handle.focus();
      await userEvent.keyboard("{ArrowRight}{Enter}");
      await userEvent.click(canvas.getByRole("button", { name: "Columns" }));
      await userEvent.click(
        within(document.body).getByRole("checkbox", { name: "Hide Clicks column" }),
      );
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(table.querySelector('[role="columnheader"][data-column-id="clicks"]')).toBeNull(),
      );
      for (const scroll of [0, 120, table.scrollWidth]) {
        table.scrollLeft = scroll;
        table.dispatchEvent(new Event("scroll", { bubbles: true }));
        await waitFor(() => {
          expectColumnBoundaries(table);
          expectPinnedHeadersCoverHandles(table);
        });
      }
    } finally {
      localStorage.removeItem("bv:data-table:reordered-pins:v1");
      await Story.load();
      canvasElement.remove();
    }
  });

  it("keeps resize handles behind pinned headers and aligned with cells across widths and themes", async () => {
    const Story = stories.ResponsiveWidths;
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    try {
      await Story.run({ canvasElement });
      const canvas = within(canvasElement);
      for (const theme of ["Light", "Dark"]) {
        await userEvent.click(canvas.getByRole("radio", { name: theme }));
        for (const width of [375, 768, 1024]) {
          const table = within(canvas.getByTestId(`responsive-${width}`)).getByRole("table");
          table.scrollIntoView({ block: "center" });
          for (const scroll of [0, 140, 320, table.scrollWidth]) {
            table.scrollLeft = scroll;
            table.dispatchEvent(new Event("scroll", { bubbles: true }));
            await waitFor(() => {
              expectColumnBoundaries(table);
              expectPinnedHeadersCoverHandles(table);
            });
          }
        }
      }
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });

  it("aligns numeric values and resize markers with their column boundaries", async () => {
    const Story = stories.ServerSorting;
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    try {
      await Story.run({ canvasElement });
      const table = within(canvasElement).getByRole("table");
      for (const handle of table.querySelectorAll<HTMLElement>('hr[aria-orientation="vertical"]')) {
        expect(getComputedStyle(handle, "::after").right).toBe("0px");
      }
      for (const id of ["position", "volume", "clicks", "impressions", "ctr"]) {
        for (const cell of table.querySelectorAll<HTMLElement>(
          `[role="cell"][data-column-id="${id}"]`,
        )) {
          const content = cell.firstElementChild as HTMLElement;
          const text = document.createRange();
          text.selectNodeContents(content);
          expect(text.getBoundingClientRect().right).toBeCloseTo(
            cell.getBoundingClientRect().right - parseFloat(getComputedStyle(cell).paddingRight),
            1,
          );
        }
      }
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });
});
