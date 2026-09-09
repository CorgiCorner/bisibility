import { composeStory } from "@storybook/react";
import { within } from "@testing-library/dom";
import { expect, waitFor } from "storybook/test";
import { describe, it } from "vitest";
import preview from "../.storybook/preview";
import { KeywordNoRowsOverlay } from "../components/keywords/grid/KeywordTableStatus";
import { DataTable } from "../components/ui";
import meta from "../components/ui/data-table/DataTable.stories";

function expectCentered(root: HTMLElement, message: HTMLElement) {
  const viewport = root.getBoundingClientRect();
  const bounds = message.getBoundingClientRect();
  const viewportLeft = viewport.left + root.clientLeft;
  expect(bounds.left).toBeGreaterThanOrEqual(viewportLeft);
  expect(bounds.right).toBeLessThanOrEqual(viewportLeft + root.clientWidth);
  expect(bounds.left + bounds.width / 2).toBeCloseTo(viewportLeft + root.clientWidth / 2, 0);
}

describe("DataTable empty viewport", () => {
  for (const layout of ["auto", "fill"] as const) {
    it(`keeps the filtered empty state visible while scrolling and resizing in ${layout} layout`, async () => {
      const Story = composeStory(
        {
          render: () => (
            <div style={{ height: 520, width: 768 }} data-testid="empty-frame">
              <DataTable
                ariaLabel="Filtered keywords"
                columns={[
                  { id: "keyword", header: "Keyword", size: 1600 },
                  { id: "position", header: "Position", size: 800 },
                ]}
                emptyState={
                  <KeywordNoRowsOverlay
                    state={{
                      title: "No keywords match 1 active filter",
                      description:
                        "Adjust or clear the active filters to show the full keyword list.",
                    }}
                  />
                }
                id={`empty-viewport-${layout}`}
                layout={layout}
                onSortingChange={() => undefined}
                rows={[]}
                sorting={null}
              />
            </div>
          ),
        },
        meta,
        preview,
      );
      const canvasElement = document.createElement("div");
      document.body.appendChild(canvasElement);
      try {
        await Story.run({ canvasElement });
        const canvas = within(canvasElement);
        const root = canvas.getByRole("table", { name: "Filtered keywords" });
        const frame = canvas.getByTestId("empty-frame");
        const heading = canvas.getByRole("heading", { name: "No keywords match 1 active filter" });
        const message = heading.parentElement as HTMLElement;
        for (const width of [768, 375, 1200]) {
          frame.style.width = `${width}px`;
          await waitFor(() => {
            expect(root.clientWidth).toBe(width - 2);
            expectCentered(root, message);
          });
          for (const scrollLeft of [400, root.scrollWidth, 0]) {
            root.scrollLeft = scrollLeft;
            root.dispatchEvent(new Event("scroll", { bubbles: true }));
            await waitFor(() => expectCentered(root, message));
          }
        }
      } finally {
        await Story.load();
        canvasElement.remove();
      }
    });
  }
});
