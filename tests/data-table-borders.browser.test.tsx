/// <reference types="vite/client" />

import { composeStories } from "@storybook/react";
import { within } from "@testing-library/dom";
import { expect, userEvent, waitFor } from "storybook/test";
import { describe, it } from "vitest";
import preview from "../.storybook/preview";
import * as storyModule from "../components/ui/data-table/DataTable.stories";

const composedStories = composeStories(storyModule, preview);
const themes = ["Dark", "Light"] as const;

function resolveColor(element: HTMLElement, value: string) {
  const probe = document.createElement("span");
  probe.style.color = value;
  element.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function headerRow(root: HTMLElement) {
  const row = root.querySelector<HTMLElement>('[role="rowgroup"] > [role="row"]');
  if (!row) throw new Error("DataTable header row is missing");
  return row;
}

function bodyRows(root: HTMLElement) {
  const body = root.querySelector<HTMLElement>('[data-testid$="-body"]');
  if (!body) throw new Error("DataTable body is missing");
  return [...body.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.role === "row",
  );
}

function rowEdgeElements(row: HTMLElement) {
  const cells = [...row.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.role === "cell",
  );
  return { cells, row };
}

function expectInternalRowEdge(row: HTMLElement) {
  const { cells } = rowEdgeElements(row);
  expect(getComputedStyle(row).borderTopWidth).toBe("0px");
  for (const cell of cells) expect(getComputedStyle(cell).borderTopWidth).toBe("0px");
  if (row.hasAttribute("aria-level")) {
    const style = getComputedStyle(row);
    expect(style.borderBottomWidth).toBe("1px");
    expect(style.borderBottomColor).toBe(resolveColor(row, "var(--border-soft)"));
    for (const cell of cells) expect(getComputedStyle(cell).borderBottomWidth).toBe("0px");
    return;
  }
  expect(getComputedStyle(row).borderBottomWidth).toBe("0px");
  for (const cell of cells) {
    const style = getComputedStyle(cell);
    expect(style.borderBottomWidth).toBe("1px");
    expect(style.borderBottomColor).toBe(resolveColor(cell, "var(--border-soft)"));
  }
}

function expectNoRowBottomEdge(row: HTMLElement) {
  const { cells } = rowEdgeElements(row);
  expect(getComputedStyle(row).borderBottomWidth).toBe("0px");
  for (const cell of cells) expect(getComputedStyle(cell).borderBottomWidth).toBe("0px");
}

function expectRootAndHeaderEdges(root: HTMLElement) {
  const header = headerRow(root);
  const rootStyle = getComputedStyle(root);
  const headerStyle = getComputedStyle(header);
  expect(rootStyle.borderTopWidth).toBe("1px");
  expect(rootStyle.borderTopColor).toBe(resolveColor(root, "var(--border)"));
  expect(headerStyle.borderTopWidth).toBe("0px");
  expect(headerStyle.borderBottomWidth).toBe("1px");
  expect(headerStyle.borderBottomColor).toBe(resolveColor(header, "var(--border)"));
  expect(header.getBoundingClientRect().top).toBeCloseTo(root.getBoundingClientRect().top + 1, 1);
}

function expectOuterBottom(root: HTMLElement) {
  const style = getComputedStyle(root);
  expect(style.borderBottomWidth).toBe("1px");
  expect(style.borderBottomColor).toBe(resolveColor(root, "var(--border)"));
}

function expectInternalAndFinalRowEdges(root: HTMLElement) {
  const rows = bodyRows(root);
  expect(rows.length).toBeGreaterThan(1);
  for (const row of rows.slice(0, -1)) expectInternalRowEdge(row);
  const last = rows.at(-1) as HTMLElement;
  expect(last).toHaveAttribute("data-last-row", "true");
  expectNoRowBottomEdge(last);
  return last;
}

function expectFooterEdge(root: HTMLElement) {
  const footer = root.querySelector<HTMLElement>('[data-testid="data-table-footer"]');
  if (!footer) throw new Error("DataTable footer is missing");
  const style = getComputedStyle(footer);
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(resolveColor(footer, "var(--border)"));
  expect(style.borderBottomWidth).toBe("0px");
  expect(footer.getBoundingClientRect().bottom).toBeCloseTo(
    root.getBoundingClientRect().bottom - 1,
    1,
  );
  return footer;
}

async function assertAcrossThemes(
  canvasElement: HTMLElement,
  assertion: () => void | Promise<void>,
) {
  const canvas = within(canvasElement);
  const themeRoot = canvasElement.querySelector<HTMLElement>("[data-app-theme-root]");
  if (!themeRoot) throw new Error("Story theme root is missing");
  for (const theme of themes) {
    await userEvent.click(canvas.getByRole("radio", { name: theme }));
    await waitFor(() => expect(themeRoot).toHaveAttribute("data-theme", theme.toLowerCase()));
    await assertion();
  }
}

describe("DataTable border ownership", () => {
  it("keeps one outer and row rule in auto layout without a footer", async () => {
    const Story = composedStories.AutoLayoutWithSections;
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    try {
      await Story.run({ canvasElement });
      const root = within(canvasElement).getByTestId("auto-sections");
      await assertAcrossThemes(canvasElement, () => {
        expectRootAndHeaderEdges(root);
        expectOuterBottom(root);
        expect(root.querySelector('[data-testid="data-table-footer"]')).toBeNull();
        const last = expectInternalAndFinalRowEdges(root);
        expect(last.getBoundingClientRect().bottom).toBeCloseTo(
          root.getBoundingClientRect().bottom - 1,
          1,
        );
      });
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });

  it("keeps one footer separator in auto layout", async () => {
    const Story = composedStories.ServerPagination;
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    try {
      await Story.run({ canvasElement });
      const root = within(canvasElement).getByTestId("pagination");
      await assertAcrossThemes(canvasElement, () => {
        expectRootAndHeaderEdges(root);
        expectOuterBottom(root);
        const last = expectInternalAndFinalRowEdges(root);
        const footer = expectFooterEdge(root);
        expect(last.getBoundingClientRect().bottom).toBeCloseTo(
          footer.getBoundingClientRect().top,
          1,
        );
      });
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });

  it("keeps an empty auto table inside one outer frame", async () => {
    const Story = composedStories.Empty;
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    try {
      await Story.run({ canvasElement });
      const root = within(canvasElement).getByTestId("empty");
      await assertAcrossThemes(canvasElement, () => {
        expectRootAndHeaderEdges(root);
        expectOuterBottom(root);
        const rows = bodyRows(root);
        expect(rows).toHaveLength(1);
        expectNoRowBottomEdge(rows[0] as HTMLElement);
        expect((rows[0] as HTMLElement).getBoundingClientRect().bottom).toBeCloseTo(
          root.getBoundingClientRect().bottom - 1,
          1,
        );
      });
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });

  it("keeps one sticky footer separator in fill layout", async () => {
    const Story = composedStories.FillLayoutWithStickyFooter;
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    try {
      await Story.run({ canvasElement });
      const root = within(canvasElement).getByTestId("fill-layout");
      await assertAcrossThemes(canvasElement, () => {
        expectRootAndHeaderEdges(root);
        expectOuterBottom(root);
        expectInternalAndFinalRowEdges(root);
        expectFooterEdge(root);
      });
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });

  it("keeps the last mounted virtual row separator when logical rows remain", async () => {
    const Story = composedStories.TenThousandLeaves;
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    try {
      await Story.run({ canvasElement });
      const root = within(canvasElement).getByTestId("performance-10k");
      await assertAcrossThemes(canvasElement, async () => {
        expectRootAndHeaderEdges(root);
        expectOuterBottom(root);
        expect(root.querySelector('[data-testid="data-table-footer"]')).toBeNull();

        root.scrollTop = 48_000;
        root.dispatchEvent(new Event("scroll", { bubbles: true }));
        await waitFor(() => expect(root.querySelector('[data-last-row="true"]')).toBeNull());
        const lastMounted = bodyRows(root).at(-1) as HTMLElement;
        expect(lastMounted).not.toHaveAttribute("data-last-row");
        expect(Number(lastMounted.getAttribute("aria-rowindex"))).toBeLessThan(
          Number(root.getAttribute("aria-rowcount")) + 1,
        );
        expectInternalRowEdge(lastMounted);

        root.scrollTop = root.scrollHeight;
        root.dispatchEvent(new Event("scroll", { bubbles: true }));
        const logicalLast = await waitFor(() => {
          const row = root.querySelector<HTMLElement>('[data-last-row="true"]');
          expect(row).not.toBeNull();
          return row as HTMLElement;
        });
        expect(Number(logicalLast.getAttribute("aria-rowindex"))).toBe(
          Number(root.getAttribute("aria-rowcount")) + 1,
        );
        expectNoRowBottomEdge(logicalLast);
        expect(logicalLast.getBoundingClientRect().bottom).toBeCloseTo(
          root.getBoundingClientRect().bottom - 1,
          1,
        );
      });
    } finally {
      await Story.load();
      canvasElement.remove();
    }
  });
});
