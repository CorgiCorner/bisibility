/// <reference types="vite/client" />

import { composeStories } from "@storybook/react";
import { within } from "@testing-library/dom";
import { waitFor } from "storybook/test";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import preview from "../.storybook/preview";
import * as stories from "../components/keywords/PositionHistoryCard.stories";

const { Default, UnrankedAfterDepthChange, LongerDateLabels } = composeStories(stories, preview);

function checkChartGeometry(card: HTMLElement) {
  const canvas = within(card);
  const lines = card.querySelectorAll<SVGLineElement>(".recharts-cartesian-grid-horizontal line");
  const plot = lines[0].getBoundingClientRect();
  const bottom = lines[lines.length - 1].getBoundingClientRect().top;
  const dates = [...card.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text")];
  const ranks = [...card.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text")];
  const firstDate = dates[0].getBoundingClientRect();
  const lastDate = dates[dates.length - 1].getBoundingClientRect();

  for (const element of [
    canvas.getByRole("heading", { name: "Position history" }),
    canvas.getByLabelText("Check scope"),
    canvas.getByText("Recorded position"),
    canvas.getByText("Google rank over time, closer to #1 is better"),
  ]) {
    expect(element.getBoundingClientRect().left).toBeCloseTo(plot.left, 0);
  }
  expect(firstDate.left).toBeCloseTo(plot.left, 0);
  expect(lastDate.right).toBeCloseTo(plot.right, 0);
  for (let index = 1; index < dates.length; index++) {
    expect(
      dates[index].getBoundingClientRect().left - dates[index - 1].getBoundingClientRect().right,
    ).toBeGreaterThanOrEqual(8);
  }
  expect(firstDate.top - bottom).toBeGreaterThanOrEqual(16);
  expect(
    firstDate.top - Math.max(...ranks.map((rank) => rank.getBoundingClientRect().bottom)),
  ).toBeGreaterThanOrEqual(8);
  expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
}

describe("Position history chart layout", () => {
  for (const width of [390, 768, 1440]) {
    for (const [name, Story] of Object.entries({
      Default,
      UnrankedAfterDepthChange,
      LongerDateLabels,
    })) {
      it(`aligns metadata and separates axis labels at ${width}px for ${name}`, async () => {
        await page.viewport(width, 1000);
        const canvasElement = document.createElement("div");
        document.body.appendChild(canvasElement);
        try {
          await Story.run({ canvasElement });
          await document.fonts.ready;
          await waitFor(() => {
            const cards = canvasElement.querySelectorAll<HTMLElement>('[data-slot="card"]');
            expect(cards).toHaveLength(2);
            for (const card of cards) checkChartGeometry(card);
          });
        } finally {
          await Story.load();
          canvasElement.remove();
          await page.viewport(1024, 768);
        }
      });
    }
  }
});
