import { stubIntersectionObserver, stubResizeObserver } from "@/tests/observers";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { countryLevelTooltip } from "./CheckRunDetails";
import { CheckRunsSection, type CheckRunsSectionProps } from "./CheckRunsSection";
import {
  checkRunsFixtureView,
  checkRunsNow,
  checkRunsViewFor,
  completedRunFixture,
} from "./check-runs-fixtures";

function props(overrides: Partial<CheckRunsSectionProps> = {}): CheckRunsSectionProps {
  return {
    asOfDate: "2026-07-24",
    connectProviderHref: "/app/integrations",
    filter: "all",
    keywordHref: (keywordPublicId) => `/app/rank-tracker/${keywordPublicId}`,
    now: checkRunsNow,
    onAsOfDateChange: vi.fn(),
    onFilterChange: vi.fn(),
    onLoadMore: vi.fn(),
    onProviderChange: vi.fn(),
    onRangeChange: vi.fn(),
    onTriggerChange: vi.fn(),
    provider: "all",
    providerOptions: [
      { label: "DataForSEO", value: "dataforseo" },
      { label: "SerpApi", value: "serpapi" },
    ],
    range: "24h",
    reorderProvidersHref: "/app/integrations",
    reviewProvidersHref: "/app/integrations",
    timelineHref: "/app/activity",
    timeZone: "UTC",
    trigger: "all",
    view: checkRunsFixtureView,
    ...overrides,
  };
}

describe("CheckRunsSection", () => {
  it("renders the range-aware summary and invokes filter and date callbacks", async () => {
    const onFilterChange = vi.fn();
    const onAsOfDateChange = vi.fn();
    const onRangeChange = vi.fn();
    render(<CheckRunsSection {...props({ onAsOfDateChange, onFilterChange, onRangeChange })} />);

    expect(screen.getByText("DataForSEO is rate-limiting.")).toBeInTheDocument();
    expect(screen.getByText(/43 checks hit rate limits in the last 24 hours/)).toBeInTheDocument();
    expect(screen.getByText("82% direct · 43 rate-limited")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ai meeting notes" })).toHaveAttribute(
      "href",
      "/app/rank-tracker/kw_ai_meeting_notes",
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter by Skipped - 28" }));
    const asOfButton = screen.getByRole("button", { name: "As of: Jul 24, 2026" });
    fireEvent.mouseOver(asOfButton);
    expect(
      await screen.findByText(
        "Stats cover the selected 24h window ending on this date. The table starts with the newest check on or before it.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "7d" }));
    fireEvent.click(asOfButton);
    const popover = screen.getByRole("dialog", { name: "As of date" });
    fireEvent.click(within(popover).getByRole("button", { name: "July 20, 2026" }));

    expect(onFilterChange).toHaveBeenCalledWith("deferred");
    expect(onAsOfDateChange).toHaveBeenCalledWith("2026-07-20");
    expect(onRangeChange).toHaveBeenCalledWith("7d");
    expect(screen.queryByRole("dialog", { name: "As of date" })).not.toBeInTheDocument();
  });

  it("renders provider and trigger controls from the supplied options", async () => {
    const onProviderChange = vi.fn();
    const onTriggerChange = vi.fn();
    render(<CheckRunsSection {...props({ onProviderChange, onTriggerChange })} />);

    fireEvent.click(screen.getByRole("button", { name: "Filter by provider" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "SerpApi" }));
    fireEvent.click(screen.getByRole("button", { name: "Filter by trigger" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Scheduled" }));

    expect(onProviderChange).toHaveBeenCalledWith("serpapi");
    expect(onTriggerChange).toHaveBeenCalledWith("scheduled");
  });

  it("shows the failed provider attempts and billing explanation", () => {
    render(
      <CheckRunsSection
        {...props({
          filter: "failed",
          initialExpandedRunIds: ["run_failed"],
          view: checkRunsViewFor("failed"),
        })}
      />,
    );

    expect(screen.getByText("2 providers")).toBeInTheDocument();
    expect(screen.getByText("Rate limited (429)")).toBeInTheDocument();
    expect(screen.getByText("Provider error (500)")).toBeInTheDocument();
    expect(screen.getByLabelText("Not billed - no attempt completed")).toBeInTheDocument();
  });

  it("uses the timeout copy for an internal aging failure", () => {
    const failed = checkRunsViewFor("failed");
    render(
      <CheckRunsSection
        {...props({
          filter: "failed",
          view: {
            ...failed,
            rows: failed.rows.map((run) => ({ ...run, error: "stale running check" })),
          },
        })}
      />,
    );

    expect(screen.getByText("Timed out after 15 min")).toBeInTheDocument();
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument();
  });

  it("shows fallback and country-level context with its exact tooltip", async () => {
    render(
      <CheckRunsSection
        {...props({
          filter: "fallback",
          initialExpandedRunIds: ["run_fallback"],
          view: checkRunsViewFor("fallback"),
        })}
      />,
    );

    const badges = screen.getAllByText("country-level");
    expect(screen.getByText("fallback")).toBeInTheDocument();
    fireEvent.mouseOver(badges[0] as HTMLElement);
    expect(await screen.findByText(countryLevelTooltip)).toBeInTheDocument();
    expect(screen.getByText("Completed · #5 of top 20")).toBeInTheDocument();
  });

  it("shows running elapsed time and an estimated cost", () => {
    render(
      <CheckRunsSection {...props({ filter: "running", view: checkRunsViewFor("running") })} />,
    );

    expect(screen.getByText("42s")).toBeInTheDocument();
    expect(screen.getByText("~$0.002")).toBeInTheDocument();
  });

  it("replaces the table with range-aware skipped groups", () => {
    render(
      <CheckRunsSection
        {...props({
          filter: "deferred",
          range: "7d",
          view: checkRunsViewFor("deferred"),
        })}
      />,
    );

    expect(screen.queryByRole("table", { name: "Check runs" })).not.toBeInTheDocument();
    expect(screen.getByText(/Grouped by reason, last 7 days/)).toBeInTheDocument();
    expect(screen.getByText("Rate limited · all providers")).toBeInTheDocument();
    expect(screen.getByText("No provider assigned")).toBeInTheDocument();
    expect(screen.getByText("Budget cap reached")).toBeInTheDocument();
    expect(screen.getByText("Paused during import")).toBeInTheDocument();
  });

  it("collapses provider health when the selected range has no issues", () => {
    render(
      <CheckRunsSection
        {...props({
          view: {
            ...checkRunsFixtureView,
            deferredGroups: [],
            providerHealth: [
              {
                coveredAsFallback: 0,
                direct: 4,
                failed: 0,
                isPrimary: true,
                provider: "dataforseo",
                providerLabel: "DataForSEO",
                rateLimited: 0,
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("Providers healthy · DataForSEO 100% direct")).toBeInTheDocument();
    expect(screen.queryByText(/is rate-limiting/)).not.toBeInTheDocument();
  });

  it("uses the explicit primary provider instead of the first health entry", () => {
    render(
      <CheckRunsSection
        {...props({
          view: {
            ...checkRunsFixtureView,
            deferredGroups: [],
            providerHealth: [
              {
                coveredAsFallback: 0,
                direct: 0,
                failed: 0,
                isPrimary: false,
                provider: "serpapi",
                providerLabel: "SerpApi",
                rateLimited: 0,
              },
              {
                coveredAsFallback: 0,
                direct: 4,
                failed: 0,
                isPrimary: true,
                provider: "dataforseo",
                providerLabel: "DataForSEO",
                rateLimited: 0,
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("Providers healthy · DataForSEO 100% direct")).toBeInTheDocument();
  });

  it("removes narrow columns from the DOM and moves their values into details", async () => {
    const controllers = stubResizeObserver();

    render(
      <CheckRunsSection
        {...props({
          initialExpandedRunIds: ["run_completed"],
          view: { ...checkRunsFixtureView, rows: [completedRunFixture] },
        })}
      />,
    );

    controllers[0]?.trigger([
      {
        contentRect: { width: 520 } as DOMRectReadOnly,
        target: document.body,
      } as unknown as ResizeObserverEntry,
    ]);

    await waitFor(() => {
      expect(screen.queryByRole("columnheader", { name: "Depth" })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "Cost" })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "When" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Depth · Top 20")).toBeInTheDocument();
    expect(screen.getByText("Cost · $0.0035")).toBeInTheDocument();
    expect(screen.getByText("When · 1h ago")).toBeInTheDocument();
  });

  it("auto-loads only the first three observed pages", () => {
    const controllers = stubIntersectionObserver();
    const onLoadMore = vi.fn();
    const initial = props({ onLoadMore });
    const { rerender } = render(<CheckRunsSection {...initial} />);

    for (let page = 0; page < 3; page += 1) {
      controllers[page]?.trigger([{ isIntersecting: true } as IntersectionObserverEntry]);
      rerender(
        <CheckRunsSection
          {...initial}
          view={{
            ...initial.view,
            rows: [
              ...initial.view.rows,
              ...Array.from({ length: page + 1 }, (_, index) => ({
                ...completedRunFixture,
                id: `added-${page}-${index}`,
              })),
            ],
          }}
        />,
      );
    }

    expect(onLoadMore).toHaveBeenCalledTimes(3);
    expect(controllers).toHaveLength(3);
  });
});
