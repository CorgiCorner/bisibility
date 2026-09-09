/// <reference types="vite/client" />

import { composeStories } from "@storybook/react";
import { within } from "@testing-library/dom";
import { expect, userEvent, waitFor } from "storybook/test";
import { describe, it } from "vitest";
import preview from "../.storybook/preview";
import * as storyModule from "../components/ui/data-table/DataTable.stories";
import "./data-table-borders.browser.test";
import "./data-table-empty.browser.test";
import "./data-table-density-menu.browser.test";
import "./data-table-scroll.browser.test";

const composedStories = composeStories(storyModule, preview);
const storyEntries = Object.entries(composedStories);
const resizeStoryEntries = [
  ["PointerResizing", composedStories.PointerResizing, "bv:data-table:resize:v1"],
  ["KeyboardResizing", composedStories.KeyboardResizing, "bv:data-table:resize-keyboard:v1"],
] as const;
const responsiveWidths = [375, 768, 1024] as const;

function resolveBackgroundColor(element: HTMLElement, value: string) {
  const probe = document.createElement("span");
  probe.style.backgroundColor = value;
  element.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
}

function tableRow(table: HTMLElement, text: string) {
  const row = within(table).getByText(text).closest<HTMLElement>('[role="row"]');
  if (!row) throw new Error(`Row is missing for ${text}`);
  return row;
}

function expectPinnedRowSurface(
  table: HTMLElement,
  row: HTMLElement,
  expectedRowBackground: string,
) {
  const rowBackground = getComputedStyle(row).backgroundColor;
  expect(rowBackground).toBe(resolveBackgroundColor(row, expectedRowBackground));

  const tableBackground = getComputedStyle(table).backgroundColor;
  for (const columnId of ["selection", "keyword", "actions"]) {
    const cell = row.querySelector<HTMLElement>(`[role="cell"][data-column-id="${columnId}"]`);
    expect(cell).not.toBeNull();
    const style = getComputedStyle(cell as HTMLElement);
    expect(style.position).toBe("sticky");
    expect(style.backgroundColor).toBe(tableBackground);
    expect(style.backgroundImage).not.toBe("none");
    expect(style.backgroundImage).toContain(rowBackground);
  }
}

function expectResponsiveRowSurfaces(table: HTMLElement) {
  expectPinnedRowSurface(
    table,
    tableRow(table, "rank monitoring"),
    "color-mix(in srgb, var(--bg-sunken) 52%, transparent)",
  );
  expectPinnedRowSurface(
    table,
    tableRow(table, "technical seo audit"),
    "color-mix(in srgb, var(--bg-sunken) 52%, transparent)",
  );
  expectPinnedRowSurface(table, tableRow(table, "Monitoring group"), "var(--bg-elev)");
  expectPinnedRowSurface(table, tableRow(table, "search visibility report"), "var(--nav-active)");
  expectPinnedRowSurface(table, tableRow(table, "archived comparison"), "var(--bg-elev)");
}

function expectSharedSortableHeaderTypography(canvasElement: HTMLElement) {
  const sortable = canvasElement.querySelector<HTMLElement>(
    '[role="columnheader"] button[aria-sort]',
  );
  const columnHeader = sortable?.closest<HTMLElement>('[role="columnheader"]');
  expect(sortable).not.toBeNull();
  expect(columnHeader).not.toBeNull();

  const sortableStyle = getComputedStyle(sortable as HTMLElement);
  const sharedStyle = getComputedStyle(columnHeader as HTMLElement);
  expect({
    bottom: sortableStyle.paddingBottom,
    left: sortableStyle.paddingLeft,
    right: sortableStyle.paddingRight,
    top: sortableStyle.paddingTop,
  }).toEqual({ bottom: "0px", left: "0px", right: "0px", top: "0px" });
  expect({
    fontFamily: sortableStyle.fontFamily,
    fontSize: sortableStyle.fontSize,
    fontWeight: sortableStyle.fontWeight,
    letterSpacing: sortableStyle.letterSpacing,
    textTransform: sortableStyle.textTransform,
  }).toEqual({
    fontFamily: sharedStyle.fontFamily,
    fontSize: sharedStyle.fontSize,
    fontWeight: sharedStyle.fontWeight,
    letterSpacing: sharedStyle.letterSpacing,
    textTransform: sharedStyle.textTransform,
  });
  expect(sharedStyle.fontFamily).toContain("Geist Storybook");
  expect(sharedStyle.fontSize).toBe("10px");
  expect(sharedStyle.fontWeight).toBe("600");
  expect(sharedStyle.letterSpacing).toBe("0.8px");
  expect(sharedStyle.textTransform).toBe("uppercase");
}

function expectNormalWidthShortHeadersFit(table: HTMLElement) {
  for (const columnId of ["position", "volume", "clicks"]) {
    const label = table.querySelector<HTMLElement>(
      `[role="columnheader"][data-column-id="${columnId}"] button[aria-sort] > span`,
    );
    expect(label).not.toBeNull();
    expect((label as HTMLElement).clientWidth).toBeGreaterThanOrEqual(
      (label as HTMLElement).scrollWidth,
    );
  }
}

function expectPositionHeaderFits(
  table: HTMLElement,
  ariaSort: "ascending" | "descending" | "none",
) {
  const header = table.querySelector<HTMLElement>(
    '[role="columnheader"][data-column-id="position"]',
  );
  const button = header?.querySelector<HTMLButtonElement>("button[aria-sort]");
  const label = button?.querySelector<HTMLElement>(":scope > span");
  expect(header).not.toBeNull();
  expect(button).not.toBeNull();
  expect(label).not.toBeNull();
  expect(table.style.getPropertyValue("--dt-col-position")).toBe("96px");
  expect(header?.getBoundingClientRect().width).toBeCloseTo(96, 0);
  expect(button).toHaveAttribute("aria-sort", ariaSort);
  expect((label as HTMLElement).clientWidth).toBeGreaterThanOrEqual(
    (label as HTMLElement).scrollWidth,
  );
}

describe("DataTable composed stories", () => {
  it.each(storyEntries)("runs %s with its preview and play", async (_name, Story) => {
    const canvasElement = document.createElement("div");
    canvasElement.dataset.testCanvas = _name;
    document.body.appendChild(canvasElement);

    try {
      await Story.run({ canvasElement });
      const canvas = within(canvasElement);
      expect(canvas.getAllByRole("table").length).toBeGreaterThan(0);

      const themeRoot = canvasElement.querySelector<HTMLElement>("[data-app-theme-root]");
      expect(themeRoot).not.toBeNull();
      const dark = canvas.getByRole("radio", { name: "Dark" });
      const light = canvas.getByRole("radio", { name: "Light" });
      await userEvent.click(dark);
      await waitFor(() => expect(themeRoot).toHaveAttribute("data-theme", "dark"));
      expectSharedSortableHeaderTypography(canvasElement);
      await userEvent.click(light);
      await waitFor(() => expect(themeRoot).toHaveAttribute("data-theme", "light"));
      expectSharedSortableHeaderTypography(canvasElement);
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });
});

describe("DataTable resize story persistence", () => {
  it.each(resizeStoryEntries)("runs %s twice across real remounts", async (name, Story, key) => {
    let persistedLayout: string | null = null;

    for (const pass of [1, 2]) {
      if (pass === 2) expect(localStorage.getItem(key)).toBe(persistedLayout);
      const canvasElement = document.createElement("div");
      canvasElement.dataset.testCanvas = `${name}-${pass}`;
      document.body.appendChild(canvasElement);

      try {
        await Story.run({ canvasElement });
        expect(within(canvasElement).getByRole("table")).toBeVisible();
        if (pass === 1) {
          persistedLayout = localStorage.getItem(key);
          expect(persistedLayout).not.toBeNull();
        }
      } finally {
        await Story.load();
        canvasElement.remove();
      }
    }
  });
});

describe("DataTable sortable header spacing", () => {
  it("fits the normal-width Position label in every sorting state", async () => {
    const Story = composedStories.ServerSorting;
    const canvasElement = document.createElement("div");
    canvasElement.dataset.testCanvas = "sortable-header-spacing";
    document.body.appendChild(canvasElement);

    try {
      await Story.run({ canvasElement });
      const canvas = within(canvasElement);
      const table = canvas.getByRole("table");
      expectNormalWidthShortHeadersFit(table);
      expectPositionHeaderFits(table, "none");

      await userEvent.click(canvas.getByRole("button", { name: "Sort Position ascending" }));
      await waitFor(() =>
        expect(canvas.getByTestId("sort-server-sorting")).toHaveTextContent("position:asc"),
      );
      expectPositionHeaderFits(table, "ascending");

      await userEvent.click(canvas.getByRole("button", { name: "Sort Position descending" }));
      await waitFor(() =>
        expect(canvas.getByTestId("sort-server-sorting")).toHaveTextContent("position:desc"),
      );
      expectPositionHeaderFits(table, "descending");

      await userEvent.click(canvas.getByRole("button", { name: "Clear Position sorting" }));
      await waitFor(() =>
        expect(canvas.getByTestId("sort-server-sorting")).toHaveTextContent("default"),
      );
      expectPositionHeaderFits(table, "none");
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });
});

describe("DataTable pinned row surfaces", () => {
  it("keeps child and selected tones opaque across themes, widths, and horizontal scroll", async () => {
    const Story = composedStories.ResponsiveWidths;
    const canvasElement = document.createElement("div");
    canvasElement.dataset.testCanvas = "responsive-pinned-surfaces";
    document.body.appendChild(canvasElement);

    try {
      await Story.run({ canvasElement });
      const canvas = within(canvasElement);
      const themeRoot = canvasElement.querySelector<HTMLElement>("[data-app-theme-root]");
      expect(themeRoot).not.toBeNull();

      for (const width of responsiveWidths) {
        const table = within(canvas.getByTestId(`responsive-${width}`)).getByRole("table");
        await userEvent.click(
          within(table).getByRole("checkbox", { name: "Select search visibility report" }),
        );
        await waitFor(() =>
          expect(tableRow(table, "search visibility report")).toHaveAttribute(
            "data-selected",
            "true",
          ),
        );
      }

      for (const theme of ["Dark", "Light"] as const) {
        await userEvent.click(canvas.getByRole("radio", { name: theme }));
        await waitFor(() => expect(themeRoot).toHaveAttribute("data-theme", theme.toLowerCase()));

        for (const width of responsiveWidths) {
          const table = within(canvas.getByTestId(`responsive-${width}`)).getByRole("table");
          table.scrollLeft = 0;
          table.dispatchEvent(new Event("scroll", { bubbles: true }));
          expectResponsiveRowSurfaces(table);

          if (table.scrollWidth > table.clientWidth) {
            table.scrollLeft = Math.min(320, table.scrollWidth - table.clientWidth);
            table.dispatchEvent(new Event("scroll", { bubbles: true }));
            await waitFor(() => expect(table).toHaveAttribute("data-scrolled", "true"));
            expectResponsiveRowSurfaces(table);
          }
        }
      }
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });
});
