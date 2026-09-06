import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { routerMock } from "@/tests/next-navigation";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@phosphor-icons/react", async (importActual) => {
  const actual = await importActual<typeof import("@phosphor-icons/react")>();
  return {
    ...actual,
    ChartBarIcon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg data-icon="chart-bar" {...props} />
    ),
    GoogleLogoIcon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg data-icon="google-logo" {...props} />
    ),
  };
});

import {
  SearchInsightsNoDataState,
  SearchInsightsNoPropertyState,
} from "./SearchInsightsEmptyStates";

describe("SearchInsightsNoPropertyState", () => {
  it("uses the concise connection title", () => {
    render(<SearchInsightsNoPropertyState projectId="prj_abcdefghijklmnopqrstuvwx" />);

    expect(screen.getByRole("heading", { name: "Connect Search Console" })).toBeInTheDocument();
    expect(screen.queryByText(/see what Google reports/i)).not.toBeInTheDocument();
  });

  it("sends the consent screen back to this module, not to Integrations", () => {
    render(<SearchInsightsNoPropertyState projectId="prj_abcdefghijklmnopqrstuvwx" />);

    const link = screen.getByRole("link", { name: "Connect Search Console" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("/api/integrations/google/install?");
    expect(decodeURIComponent(href)).toContain(
      "returnPath=/app/prj_abcdefghijklmnopqrstuvwx/search-console",
    );
    expect(href).toContain("provider=gsc");
  });

  it("links to Search Console in a securely opened new tab", () => {
    render(<SearchInsightsNoPropertyState projectId="prj_abcdefghijklmnopqrstuvwx" />);

    const link = screen.getByRole("link", { name: "Open Search Console" });
    expect(link).toHaveAttribute("href", "https://search.google.com/search-console/about");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    expect(link.lastElementChild).toHaveClass("MuiButton-endIcon");
    expect(link.lastElementChild?.querySelector("svg")).toBeInTheDocument();

    const actions = link.parentElement;
    expect(actions?.firstElementChild).toBe(link);
    expect(actions?.lastElementChild).toBe(
      screen.getByRole("link", { name: "Connect Search Console" }),
    );
  });

  it("asks for a reconnect rather than a first connection once consent lapsed", () => {
    render(<SearchInsightsNoPropertyState projectId="prj_abcdefghijklmnopqrstuvwx" reauth />);

    expect(screen.getByRole("link", { name: "Reconnect Search Console" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing already imported is affected/)).toBeInTheDocument();
  });
});

const action = async () => ({ ok: true as const, state: "running" });
const facts = {
  connectionStatus: "connected" as const,
  pauseStartedAt: "2026-08-27T12:00:00.000Z",
  pausedReason: "user",
  state: "paused",
};

const runtime = {
  workerStatus: {
    status: "ok" as const,
    temporalIdentityComparison: { detail: "identities match", status: "match" as const },
  },
};

const observabilityFacts = {
  consecutiveDays: 93,
  deepHistoryMonths: { completed: 3, target: 16 },
  lastActivityAt: "2026-08-29T17:00:00.000Z",
  lastProbeAt: "2026-08-29T17:00:00.000Z",
  qualifyingDays: 7,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 1,
    expectedDayMs: 1,
    nextRequestInMs: 0,
    silenceMs: 0,
    thresholdMs: 1,
  },
  targetDays: 10,
} satisfies ImportObservabilityFacts;

function renderNoData(overrides = {}, importFacts = observabilityFacts) {
  return render(
    <SearchInsightsNoDataState
      facts={{ ...facts, observability: importFacts, runtime, ...overrides }}
      pauseAction={action}
      projectId="prj_abcdefghijklmnopqrstuvwx"
      resumeAction={action}
      retryAction={action}
    />,
  );
}

describe("SearchInsightsNoDataState", () => {
  it("renders waiting for first data as its own honest empty state", () => {
    const { container } = renderNoData({
      pausedReason: null,
      state: "waiting_for_first_data",
    });

    expect(screen.getByRole("heading", { name: "Waiting for first data" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Google has not reported any search data for this property yet. We check daily and import automatically when it appears.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/0 of 0|\bETA\b|completion|first-28/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  /**
   * This card is the only surface in the pre-first-view window - the strip is not rendered yet -
   * so a state that resolves itself has to offer a way to watch it resolve.
   */
  it.each([
    ["queued", { pausedReason: null, state: "queued" }],
    ["running", { pausedReason: null, state: "running" }],
  ])("offers a refresh control while %s", (_name, overrides) => {
    renderNoData(overrides);

    expect(screen.getByRole("button", { name: "Refresh import status" })).toBeInTheDocument();
  });

  it("does not schedule refreshes while the import is queued", () => {
    vi.useFakeTimers();
    renderNoData({ pausedReason: null, state: "queued" });

    expect(
      screen.getByRole("button", { name: "Refresh import status" }).closest("[data-auto-refresh]"),
    ).toHaveAttribute("data-auto-refresh", "inactive");
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(90_000));
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("offers no refresh control for a state that waits on the customer", () => {
    renderNoData({ connectionStatus: "needs_reauth" });

    expect(screen.getByRole("heading", { name: "Needs reauth" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh import status" })).not.toBeInTheDocument();
  });

  it("renders the exact actor-neutral paused contract with exactly one Resume", () => {
    const { container } = renderNoData();
    expect(screen.getByRole("heading", { name: "Paused by you" })).toBeInTheDocument();
    // The strip is the single home for the provenance counters; this card states the block only.
    expect(
      screen.getByText("The first look opens once the first finalized day is imported."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("qualifying-progress")).not.toBeInTheDocument();
    expect(screen.queryByTestId("deep-history-progress")).not.toBeInTheDocument();
    expect(screen.queryByTestId("freshness-note")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Paused on Aug 27, 2026. New finalized days will not be imported until you resume sync.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Resume Search Console import" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Resume Search Console import" })).toHaveTextContent(
      "Resume sync",
    );
    expect(container.textContent).not.toMatch(
      /import is running|resumes automatically|we will notify|data ends at|unknown date/i,
    );
    expect(screen.queryByRole("button", { name: /Refresh|Pause/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Reconnect/ })).not.toBeInTheDocument();
  });

  it.each([
    [
      "needs_reauth",
      { connectionStatus: "needs_reauth", pausedReason: "user" },
      "Needs reauth",
      "link",
    ],
    ["quota", { pausedReason: "rate_limited" }, "Paused by provider limits", null],
    [
      "error",
      { pausedReason: null, safeError: "Provider failed.", state: "failed" },
      "Needs retry",
      "button",
    ],
  ] as const)("renders focused %s state", (_name, overrides, title, actionRole) => {
    const { container } = renderNoData(overrides);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    if (actionRole === "link")
      expect(screen.getByRole("link", { name: "Reconnect Search Console" })).toBeInTheDocument();
    if (actionRole === "button")
      expect(
        screen.getByRole("button", { name: "Retry Search Console import" }),
      ).toBeInTheDocument();
    if (!actionRole) expect(screen.queryByRole("button")).not.toBeInTheDocument();
    if (_name !== "quota") expect(container.textContent).not.toMatch(/resumes automatically/i);
  });

  it("uses a neutral status icon instead of the Google icon for a worker-caused state", () => {
    renderNoData({
      pausedReason: null,
      runtime: { workerStatus: "stale" },
      state: "running",
    });

    expect(
      screen.getByRole("img", { name: "Search import status" }).querySelector("svg"),
    ).toHaveAttribute("data-icon", "chart-bar");
    expect(screen.queryByRole("img", { name: "Search Console module" })).not.toBeInTheDocument();
  });

  it.each([
    ["paused", {}],
    ["needs reauthentication", { connectionStatus: "needs_reauth" }],
    ["provider quota", { pausedReason: "rate_limited" }],
    ["error", { pausedReason: null, safeError: "Provider failed.", state: "failed" }],
    ["complete", { pausedReason: null, state: "completed" }],
    ["running", { pausedReason: null, state: "running" }],
    ["queued", { pausedReason: null, state: "queued" }],
    ["starting", { pausedReason: null, state: null }],
  ] as const)("uses the active Google logo at regular weight for %s", (_name, overrides) => {
    renderNoData(overrides);

    const icon = screen.getByRole("img", { name: "Search Console module" }).querySelector("svg");
    expect(icon).toHaveAttribute("data-icon", "google-logo");
    expect(icon).toHaveAttribute("data-icon-weight", "regular");
    expect(icon).not.toHaveAttribute("data-icon", "chart-bar");
  });
});
