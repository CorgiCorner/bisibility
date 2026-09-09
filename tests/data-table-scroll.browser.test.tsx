import { composeStories } from "@storybook/react";
import { within } from "@testing-library/dom";
import { expect, waitFor } from "storybook/test";
import { describe, it } from "vitest";
import preview from "../.storybook/preview";
import * as storyModule from "../components/ui/data-table/DataTable.stories";

const { TenThousandLeaves } = composeStories(storyModule, preview);
const layoutKey = "bv:data-table:performance-10k:v1";

function restoreStorageValue(value: string | null) {
  if (value === null) localStorage.removeItem(layoutKey);
  else localStorage.setItem(layoutKey, value);
}

async function expectInitialPerformanceViewport(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const root = canvas.getByTestId("performance-10k");
  const body = canvas.getByTestId("performance-10k-body");
  await waitFor(() => {
    expect(root.scrollLeft).toBe(0);
    expect(root.scrollTop).toBe(0);
    expect(within(root).getByText("Group 1")).toBeVisible();
  });
  expect(root.scrollHeight).toBeGreaterThan(500_000);
  expect(body.childElementCount).toBeLessThan(40);
  const frameOutput = canvas.getByTestId("performance-frame-samples");
  expect(Number(frameOutput.dataset.samples)).toBeGreaterThan(5);
  expect(Number(frameOutput.dataset.p95)).toBeGreaterThan(0);
  const header = root.querySelector<HTMLElement>('[role="columnheader"][data-column-id="keyword"]');
  expect(header).not.toBeNull();
  return (header as HTMLElement).getBoundingClientRect().width;
}

describe("DataTable performance story scroll cleanup", () => {
  it("returns to the first group after play and re-entry", async () => {
    const initialLayout = localStorage.getItem(layoutKey);
    const canvasElement = document.createElement("div");
    document.body.appendChild(canvasElement);
    let initialWidth: number | undefined;

    try {
      for (const pass of [1, 2]) {
        canvasElement.dataset.testCanvas = `performance-scroll-cleanup-${pass}`;
        await TenThousandLeaves.run({ canvasElement });
        const width = await expectInitialPerformanceViewport(canvasElement);
        if (initialWidth === undefined) initialWidth = width;
        else expect(width).toBeCloseTo(initialWidth, 0);
        expect(localStorage.getItem(layoutKey)).toBe(initialLayout);
      }
    } finally {
      await TenThousandLeaves.load();
      restoreStorageValue(initialLayout);
      canvasElement.remove();
    }
  });
});
