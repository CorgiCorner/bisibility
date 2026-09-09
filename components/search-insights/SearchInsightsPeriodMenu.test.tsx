import { type FinalizedWindow, finalizedWindow } from "@/lib/search-insights/dates";
import type { SearchInsightsContext } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInsightsPeriodMenu } from "./SearchInsightsPeriodMenu";

const onPeriodChange = vi.fn();

const period = {
  comparison: "previous_period" as const,
  days: 7,
  id: "7" as const,
  label: "7 finalized days",
};
const window = finalizedWindow("2026-08-28", 7);
const importFacts: ImportObservabilityFacts = {
  consecutiveDays: 90,
  deepHistoryMonths: { completed: 3, target: 16 },
  lastActivityAt: null,
  lastProbeAt: null,
  qualifyingDays: 28,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
    d28: { current: true, previous: true },
    d90: { current: true, previous: false },
  },
  stall: {
    expectedBatchMs: 1,
    expectedDayMs: 60_000,
    nextRequestInMs: 0,
    silenceMs: 0,
    thresholdMs: 1,
  },
  targetDays: 28,
};

function renderMenu(
  facts = importFacts,
  menuPeriod: SearchInsightsContext["period"] = period,
  menuWindow: FinalizedWindow | null = window,
  dateFormat: "iso" | "month_first" = "month_first",
  pending = false,
) {
  render(
    <SearchInsightsPeriodMenu
      dateFormat={dateFormat}
      importFacts={facts}
      onPeriodChange={onPeriodChange}
      pending={pending}
      period={menuPeriod}
      window={menuWindow}
    />,
  );
}

describe("SearchInsightsPeriodMenu", () => {
  beforeEach(() => {
    onPeriodChange.mockReset();
  });

  it("labels the trigger with only the finalized window", () => {
    renderMenu();

    const trigger = screen.getByRole("button", {
      name: "Comparison window: Aug 22 - 28",
    });
    expect(trigger).toHaveTextContent("Aug 22 - 28");
    expect(trigger).not.toHaveTextContent("Aug 15 - 21");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("puts the comparison and Pacific boundary in a left-aligned tooltip", async () => {
    renderMenu();

    const trigger = screen.getByRole("button", {
      name: "Comparison window: Aug 22 - 28",
    });
    await userEvent.hover(trigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Aug 22 - 28 · 7 finalized days");
    expect(tooltip).toHaveTextContent("compared with Aug 15 - 21");
    expect(tooltip).toHaveTextContent("Google finalizes days in Pacific time");
    expect(within(tooltip).getByTestId("period-tooltip-content")).toHaveClass(
      "max-w-80",
      "text-left",
    );
    expect(tooltip.closest("[data-ui-tooltip]")).toHaveAttribute("data-side", "bottom");
    expect(tooltip.closest("[data-ui-tooltip]")).toHaveAttribute("data-align", "start");
  });

  it("keeps a deliberately wide ISO tooltip independent from the chip width", async () => {
    renderMenu(importFacts, period, window, "iso");
    const trigger = screen.getByRole("button", {
      name: "Comparison window: 2026-08-22 - 2026-08-28",
    });

    await userEvent.hover(trigger);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "2026-08-22 - 2026-08-28 · 7 finalized days",
    );
    expect(within(screen.getByRole("tooltip")).getByTestId("period-tooltip-content")).toHaveClass(
      "max-w-80",
    );
  });

  it("reports the selected period to the workspace", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: /^Comparison window:/ }));
    await userEvent.click(await screen.findByText("90 finalized days"));
    expect(onPeriodChange).toHaveBeenCalledExactlyOnceWith("90");
  });

  it("keeps the calendar still while the period navigation is pending", () => {
    renderMenu(importFacts, period, window, "month_first", true);

    const trigger = screen.getByRole("button", { name: /^Comparison window:/ });
    expect(trigger).toBeDisabled();
    expect(trigger).not.toHaveAttribute("aria-busy", "true");
    expect(trigger.querySelectorAll("svg")).toHaveLength(2);
    expect(trigger.querySelectorAll("svg.animate-spin")).toHaveLength(0);
  });

  it("does not report a period event when the active window is picked again", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: /^Comparison window:/ }));
    await userEvent.click(await screen.findByRole("option", { name: /7 finalized days/ }));

    expect(onPeriodChange).not.toHaveBeenCalled();
  });

  it("names and selects the first look without navigating", async () => {
    renderMenu(
      importFacts,
      {
        comparison: "previous_period",
        days: 1,
        id: "1",
        label: "1 finalized day",
      },
      finalizedWindow("2026-08-28", 1),
    );

    const trigger = screen.getByRole("button", {
      name: "Comparison window: First look, Aug 28",
    });
    expect(trigger).toHaveTextContent("First look · Aug 28");
    await userEvent.click(trigger);

    const firstLook = await screen.findByRole("option", { name: /1 finalized day/ });
    expect(firstLook).toHaveAttribute("aria-selected", "true");
    expect(firstLook).toHaveTextContent("Aug 28");
    expect(firstLook).not.toHaveTextContent("first look");
    await userEvent.click(firstLook);

    expect(onPeriodChange).not.toHaveBeenCalled();
  });

  it("disables a period that the readiness selector has not unlocked", async () => {
    renderMenu({
      ...importFacts,
      consecutiveDays: 20,
      readyThrough: {
        d1: { current: true, previous: true },
        d7: { current: true, previous: true },
        d28: { current: false, previous: false },
        d90: { current: false, previous: false },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: /^Comparison window:/ }));

    const option = await screen.findByRole("option", { name: /28 finalized days/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("Aug 1 - 28 · ready in ~8 min");
    expect(option).not.toHaveTextContent("Jul 4 - 31");
    expect(option).not.toHaveTextContent("vs previous 28");
  });
});
