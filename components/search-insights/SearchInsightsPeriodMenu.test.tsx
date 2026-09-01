import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInsightsPeriodMenu } from "./SearchInsightsPeriodMenu";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({ track: mocks.track }));

const period = { days: 28, id: "28" as const, label: "28 finalized days", sub: "vs previous 28" };
const importFacts: ImportObservabilityFacts = {
  consecutiveDays: 90,
  deepHistoryMonths: { completed: 3, target: 16 },
  lastActivityAt: null,
  lastProbeAt: null,
  qualifyingDays: 28,
  readyThrough: {
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

function renderMenu(yoyMonths = 9, facts = importFacts) {
  setNavigationState({
    pathname: "/app/prj_1/search-console",
    searchParams: { google: "select", period: "28" },
  });
  render(
    <SearchInsightsPeriodMenu
      importFacts={facts}
      period={period}
      yoy={{ monthsImported: yoyMonths, required: 13 }}
    />,
  );
}

describe("SearchInsightsPeriodMenu", () => {
  beforeEach(() => {
    mocks.track.mockReset();
  });

  it("labels the trigger with the finalized window and its comparison", () => {
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Comparison window" });
    expect(trigger).toHaveTextContent("28 finalized days / vs previous 28");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("aligns the listbox left edge with its trigger", async () => {
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Comparison window" });
    await userEvent.click(trigger);

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("replaces only the period and keeps the other parameters", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Comparison window" }));
    await userEvent.click(await screen.findByText("90 finalized days"));

    expect(routerMock.replace).toHaveBeenCalledWith(
      "/app/prj_1/search-console?google=select&period=90",
      { scroll: false },
    );
    expect(mocks.track).toHaveBeenCalledWith("search_insights_period_changed", { window: "90" });
  });

  it("does not report a period event when the active window is picked again", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Comparison window" }));
    await userEvent.click(await screen.findByRole("option", { name: /28 finalized days/ }));

    expect(mocks.track).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("shows year over year as unavailable with the import progress", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Comparison window" }));

    const options = await screen.findAllByRole("option");
    const yoy = options.at(-1);
    expect(yoy).toHaveTextContent("Year over year");
    expect(yoy).toHaveTextContent("Needs 13 months of history / 9 of 16 imported");
    expect(yoy).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(yoy as HTMLElement);
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("disables a period that the readiness selector has not unlocked", async () => {
    renderMenu(9, {
      ...importFacts,
      consecutiveDays: 20,
      readyThrough: {
        d7: { current: true, previous: true },
        d28: { current: false, previous: false },
        d90: { current: false, previous: false },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Comparison window" }));

    const option = await screen.findByRole("option", { name: /28 finalized days/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("vs previous 28 / ready in ~8 min");
  });
});
