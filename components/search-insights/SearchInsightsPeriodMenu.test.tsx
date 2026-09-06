import { type FinalizedWindow, finalizedWindow } from "@/lib/search-insights/dates";
import type { SearchInsightsContext } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransitionStartFunction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
const transition = vi.hoisted(() => ({ pending: false, start: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({ track: mocks.track }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useTransition: (): [boolean, TransitionStartFunction] => [transition.pending, transition.start],
  };
});

import { SearchInsightsPeriodMenu } from "./SearchInsightsPeriodMenu";

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
) {
  setNavigationState({
    pathname: "/app/prj_1/search-console",
    searchParams: { google: "select", period: "7" },
  });
  render(
    <SearchInsightsPeriodMenu
      dateFormat={dateFormat}
      importFacts={facts}
      period={menuPeriod}
      window={menuWindow}
    />,
  );
}

describe("SearchInsightsPeriodMenu", () => {
  beforeEach(() => {
    mocks.track.mockReset();
    transition.pending = false;
    transition.start.mockReset();
    transition.start.mockImplementation((callback) => callback());
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
    expect(tooltip).toHaveAttribute("data-popper-placement", "bottom-start");
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

  it("replaces only the period and keeps the other parameters", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: /^Comparison window:/ }));
    await userEvent.click(await screen.findByText("90 finalized days"));

    expect(routerMock.replace).toHaveBeenCalledWith(
      "/app/prj_1/search-console?google=select&period=90",
      { scroll: false },
    );
    expect(mocks.track).toHaveBeenCalledWith("search_insights_period_changed", { window: "90" });
  });

  it("issues the period navigation from inside a transition", async () => {
    let insideTransition = false;
    transition.start.mockImplementation((callback) => {
      insideTransition = true;
      callback();
      insideTransition = false;
    });
    routerMock.replace.mockImplementation(() => {
      expect(insideTransition).toBe(true);
    });
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: /^Comparison window:/ }));
    await userEvent.click(await screen.findByText("90 finalized days"));

    expect(transition.start).toHaveBeenCalledOnce();
  });

  it("keeps one calendar icon slot while the period navigation is pending", () => {
    transition.pending = true;
    renderMenu();

    const trigger = screen.getByRole("button", { name: /^Comparison window:/ });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-busy", "true");
    expect(trigger.querySelectorAll("svg")).toHaveLength(2);
    expect(trigger.querySelectorAll("svg.animate-spin")).toHaveLength(1);
  });

  it("does not report a period event when the active window is picked again", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: /^Comparison window:/ }));
    await userEvent.click(await screen.findByRole("option", { name: /7 finalized days/ }));

    expect(mocks.track).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
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

    expect(mocks.track).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
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
