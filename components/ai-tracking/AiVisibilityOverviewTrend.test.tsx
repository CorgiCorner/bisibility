import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { OverviewDay } from "@/lib/ai-tracking/overview-model";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { stubResizeObserver } from "@/tests/observers";
import { cleanup, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { AiVisibilityOverviewTrend, visibilityTrendTicks } from "./AiVisibilityOverviewTrend";

const messages = { ...shared, ...tracking };

function days(count: number): OverviewDay[] {
  return Array.from({ length: count }, (_, index) => ({
    answers: 1,
    citedShare: 0.4,
    day: `2026-10-${String(11 + index).padStart(2, "0")}`,
    mentionedShare: 0.8,
  }));
}

afterEach(() => {
  cleanup();
});

it("keeps the first and last day and thins the ticks between them", () => {
  expect(visibilityTrendTicks(0)).toEqual([]);
  expect(visibilityTrendTicks(1)).toEqual([0]);
  expect(visibilityTrendTicks(2)).toEqual([0, 1]);
  expect(visibilityTrendTicks(9)).toEqual([0, 2, 4, 6, 8]);
});

it("renders a legend and short day labels", () => {
  const observers = stubResizeObserver();
  renderWithFeatureMessages(
    <AiVisibilityOverviewTrend days={days(9)} schedulesHref="/app/prj_example/schedules" />,
    { messages, timeZone: "UTC" },
  );
  expect(screen.getByRole("heading", { name: "Visibility over time" })).toHaveClass(
    "text-ui-section",
  );
  const legend = screen.getByRole("list", { name: "Chart series" });
  expect(within(legend).getByText("Mentioned")).toBeTruthy();
  expect(within(legend).getByText("Cited")).toBeTruthy();
  expect(legend.querySelector(".bg-accent")).toBeTruthy();
  expect(legend.querySelector(".bg-green")).toBeTruthy();
  act(() => {
    for (const controller of observers) {
      controller.trigger([{ contentRect: { height: 220, width: 640 } } as ResizeObserverEntry]);
    }
  });
  expect(screen.getByText("Oct 11")).toBeTruthy();
  expect(screen.queryByText("Oct 12")).toBeNull();
  expect(screen.queryByText(/2026/)).toBeNull();
});
