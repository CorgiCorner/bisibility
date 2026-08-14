import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProviderHealth } from "./CheckRunsProviderHealth";
import type { CheckRunsBudget } from "./CheckRunsStatusBands";
import { CheckRunsStatusBands } from "./CheckRunsStatusBands";
import {
  checkRunsFixtureView,
  checkRunsNow,
  completedRunFixture,
  failedRunFixture,
  staleRunFixture,
} from "./check-runs-fixtures";

const emptyBudget: CheckRunsBudget = { blocked: [], forecast: null };

function bands(overrides: Partial<Parameters<typeof CheckRunsStatusBands>[0]> = {}) {
  return {
    budget: emptyBudget,
    budgetSettingsHref: "/app/prj_test/settings#provider-usage",
    now: checkRunsNow,
    timeZone: "UTC",
    view: checkRunsFixtureView,
    ...overrides,
  };
}

describe("Checks visual conformance", () => {
  it("renders the exhausted budget band from existing forecast and skipped data", () => {
    render(
      <CheckRunsStatusBands
        {...bands({
          budget: {
            blocked: [{ keywordCount: 4, reason: "budget_exhausted" }],
            forecast: {
              capCents: 5_000,
              capLastsUntil: null,
              next48hCents: 0,
              spentCents: 5_000,
            },
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "Monthly spending limit reached. 1 check was skipped - checks resume on Aug 1.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Change limit" })).toHaveAttribute(
      "href",
      "/app/prj_test/settings#provider-usage",
    );
  });

  it("renders the projected warning at the exact existing-data percentage", () => {
    render(
      <CheckRunsStatusBands
        {...bands({
          budget: {
            blocked: [],
            forecast: {
              capCents: 5_000,
              capLastsUntil: "2026-08-08",
              next48hCents: 300,
              spentCents: 3_900,
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Estimated spend is at 84% of the $50/month limit.")).toBeVisible();
  });

  it("does not report an exhausted budget when the project has no positive cap", () => {
    render(
      <CheckRunsStatusBands
        {...bands({
          budget: {
            blocked: [],
            forecast: { capCents: 0, capLastsUntil: null, next48hCents: 0, spentCents: 0 },
          },
        })}
      />,
    );

    expect(screen.queryByText(/Monthly spending limit reached/)).not.toBeInTheDocument();
  });

  it("omits a zero skipped count when the positive cap is exhausted before deferral", () => {
    render(
      <CheckRunsStatusBands
        {...bands({
          budget: {
            blocked: [],
            forecast: {
              capCents: 5_000,
              capLastsUntil: null,
              next48hCents: 0,
              spentCents: 5_000,
            },
          },
          view: { ...checkRunsFixtureView, deferredGroups: [] },
        })}
      />,
    );

    expect(
      screen.getByText("Monthly spending limit reached. Checks resume on Aug 1."),
    ).toBeVisible();
    expect(screen.queryByText(/0 checks/)).not.toBeInTheDocument();
  });

  it("shows stale and failed retry shells without inventing an action", () => {
    const onRetryStale = vi.fn();
    const staleView = {
      ...checkRunsFixtureView,
      counts: { completed: 1, deferred: 0, failed: 0, running: 0, runs: 1, viaFallback: 0 },
      deferredGroups: [],
      rows: [completedRunFixture],
      staleCount: 1,
    };
    const { rerender } = render(
      <CheckRunsStatusBands {...bands({ onRetryStale, view: staleView })} />,
    );

    expect(
      screen.getByText(
        "Positions shown may be stale. 1 check last completed more than 48 hours ago.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry stale" }));
    expect(onRetryStale).toHaveBeenCalledOnce();

    rerender(
      <CheckRunsStatusBands
        {...bands({
          view: {
            ...staleView,
            rows: [staleRunFixture],
            staleCount: 0,
          },
        })}
      />,
    );
    expect(screen.queryByText(/Positions shown may be stale/)).not.toBeInTheDocument();

    rerender(<CheckRunsStatusBands {...bands({ showStale: false, view: staleView })} />);
    expect(screen.queryByText(/Positions shown may be stale/)).not.toBeInTheDocument();

    const failedView = {
      ...staleView,
      counts: { completed: 70, deferred: 24, failed: 2, running: 0, runs: 72, viaFallback: 0 },
      rows: [failedRunFixture],
      staleCount: 0,
    };
    rerender(<CheckRunsStatusBands {...bands({ view: failedView })} />);
    expect(
      screen.getByText(
        "2 of 96 checks failed. Successful checks in the same run kept their results.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry failed" })).toBeDisabled();
  });

  it("states the delivery verdict and closes the rate-limit arithmetic", () => {
    const onFilterChange = vi.fn();
    render(
      <ProviderHealth
        onFilterChange={onFilterChange}
        range="24h"
        reorderProvidersHref="/app/prj_test/integrations"
        view={checkRunsFixtureView}
      />,
    );

    expect(
      screen.getByText(
        "1,182 of 1,213 checks delivered - backup covered 19 checks, 3 failed, and 28 were skipped.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("43 rate-limited · 19 checks covered by backup · 24 skipped."),
    ).toBeVisible();
    expect(screen.getByText("973 as primary · 43 rate-limited")).toBeInTheDocument();
    expect(screen.getByText("166 as primary · 19 as backup · 0 rate-limited")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show skipped" }));
    expect(onFilterChange).toHaveBeenCalledWith("deferred");
  });

  it("does not present fallback coverage as rate-limit arithmetic", () => {
    render(
      <ProviderHealth
        onFilterChange={vi.fn()}
        range="24h"
        reorderProvidersHref="/app/prj_test/integrations"
        view={{
          ...checkRunsFixtureView,
          counts: { ...checkRunsFixtureView.counts, deferred: 0, viaFallback: 19 },
          deferredGroups: [],
          providerHealth: checkRunsFixtureView.providerHealth.map((provider) => ({
            ...provider,
            rateLimited: provider.isPrimary ? 10 : 0,
          })),
        }}
      />,
    );

    expect(screen.getByText("10 rate-limited · 19 checks covered by backup.")).toBeVisible();
    expect(screen.queryByText(/10 rate-limited -> 19/)).not.toBeInTheDocument();
  });

  it("uses the explicit primary for a healthy verdict", () => {
    render(
      <ProviderHealth
        onFilterChange={vi.fn()}
        range="7d"
        reorderProvidersHref="/app/prj_test/integrations"
        view={{
          ...checkRunsFixtureView,
          counts: { completed: 4, deferred: 0, failed: 0, running: 0, runs: 4, viaFallback: 0 },
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
        }}
      />,
    );

    expect(
      screen.getByText(
        "4 of 4 checks delivered through DataForSEO with no fallback, failures, or skips.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/is rate-limiting/)).not.toBeInTheDocument();
  });
});
