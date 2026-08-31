import { render, screen } from "@testing-library/react";
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
  completedDays: 7,
  connectionStatus: "connected" as const,
  deploymentMode: "self-host" as const,
  firstViewReady: false,
  pauseStartedAt: "2026-08-27T12:00:00.000Z",
  pausedReason: "user",
  state: "paused",
  waiting: false,
  workerStatus: "ok" as const,
};

function renderNoData(overrides = {}) {
  return render(
    <SearchInsightsNoDataState
      facts={{ ...facts, ...overrides }}
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
      completedDays: 0,
      pausedReason: null,
      state: "waiting_for_first_data",
    });

    expect(screen.getByRole("heading", { name: "Waiting for search data" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Google has not reported any search data for this property yet. We check daily and will import automatically when it appears.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/0 of 0|\bETA\b|completion|first-28/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the exact actor-neutral paused contract with exactly one Resume", () => {
    const { container } = renderNoData();
    expect(screen.getByRole("heading", { name: "Backfill paused" })).toBeInTheDocument();
    expect(screen.getByText("7 of 28 finalized days are imported.")).toBeInTheDocument();
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
      /Backfill in progress|import is running|resumes automatically|we will notify|data ends at|unknown date|paused by you/i,
    );
    expect(screen.queryByRole("button", { name: /Refresh|Pause/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Reconnect/ })).not.toBeInTheDocument();
  });

  it.each([
    [
      "needs_reauth",
      { connectionStatus: "needs_reauth", pausedReason: "user" },
      "Reconnect Search Console",
      "link",
    ],
    ["quota", { pausedReason: "rate_limited" }, "Backfill paused by provider limits", null],
    [
      "worker",
      { pausedReason: null, state: "running", workerStatus: "stale" },
      "Backfill waiting for the worker",
      null,
    ],
    [
      "error",
      { pausedReason: null, safeError: "Provider failed.", state: "failed" },
      "Backfill needs attention",
      "button",
    ],
  ] as const)("renders focused %s state", (_name, overrides, title, actionRole) => {
    const { container } = renderNoData(overrides);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    if (actionRole === "link")
      expect(screen.getByRole("link", { name: title })).toBeInTheDocument();
    if (actionRole === "button")
      expect(
        screen.getByRole("button", { name: "Retry Search Console import" }),
      ).toBeInTheDocument();
    if (!actionRole) expect(screen.queryByRole("button")).not.toBeInTheDocument();
    if (_name !== "quota") expect(container.textContent).not.toMatch(/resumes automatically/i);
  });

  it.each([
    ["paused", {}],
    ["needs reauthentication", { connectionStatus: "needs_reauth" }],
    ["provider quota", { pausedReason: "rate_limited" }],
    ["worker", { pausedReason: null, state: "running", workerStatus: "stale" }],
    ["error", { pausedReason: null, safeError: "Provider failed.", state: "failed" }],
    ["complete", { firstViewReady: true, pausedReason: null }],
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
