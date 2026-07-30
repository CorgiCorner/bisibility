import { appPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChecksWorkspace } from "./ChecksWorkspace";
import {
  checkRunsFixtureView,
  checkRunsNow,
  completedRunFixture,
} from "./runs/check-runs-fixtures";
import { upcomingViewFixture } from "./upcoming/upcoming-fixtures";

const mocks = vi.hoisted(() => ({
  loadCheckRuns: vi.fn(),
}));

vi.mock("@/lib/actions/checks", () => ({
  loadCheckRuns: mocks.loadCheckRuns,
}));

function useViewport(mode: "rail" | "slim" | "strip") {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      matches: query.includes("1280") ? mode === "rail" : mode !== "strip",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  );
}

function renderWorkspace() {
  return render(
    <ChecksWorkspace
      initialRuns={checkRunsFixtureView}
      now={checkRunsNow.toISOString()}
      projectId="project_1"
      projectRef="prj_1"
      providerOptions={[
        { label: "DataForSEO", value: "dataforseo" },
        { label: "SerpAPI", value: "serpapi" },
      ]}
      upcoming={upcomingViewFixture}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ChecksWorkspace", () => {
  it("renders the strip forecast above the new runs section", () => {
    useViewport("strip");
    renderWorkspace();

    expect(screen.getByText(/Forecast for scheduled checks/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Upcoming checks")).not.toHaveLength(0);
    expect(screen.getByText("Check runs")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Check runs" })).toBeInTheDocument();
  });

  it("appends the next cursor page", async () => {
    useViewport("rail");
    const older = {
      ...completedRunFixture,
      id: "run_older",
      keyword: "older keyword",
      keywordPublicId: "kw_older",
    };
    mocks.loadCheckRuns.mockResolvedValue({
      ...checkRunsFixtureView,
      nextCursor: null,
      rows: [older],
    });
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Load 50 more" }));

    await waitFor(() => {
      expect(mocks.loadCheckRuns).toHaveBeenCalledWith({
        cursor: checkRunsFixtureView.nextCursor,
        filter: "all",
        projectId: "project_1",
        provider: "all",
        range: "7d",
        trigger: "all",
      });
    });
    expect(await screen.findByRole("link", { name: "older keyword" })).toHaveAttribute(
      "href",
      appPath("prj_1", "keywords", "kw_older"),
    );
  });

  it("refetches by range and uses the selected project-local day boundary", async () => {
    useViewport("slim");
    mocks.loadCheckRuns.mockResolvedValue({ ...checkRunsFixtureView, nextCursor: null });
    renderWorkspace();

    fireEvent.click(screen.getByRole("radio", { name: "24h" }));
    await waitFor(() => {
      expect(mocks.loadCheckRuns).toHaveBeenLastCalledWith({
        cursor: undefined,
        filter: "all",
        projectId: "project_1",
        provider: "all",
        range: "24h",
        trigger: "all",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "As of: Jul 24, 2026" }));
    const popover = screen.getByRole("dialog", { name: "As of date" });
    fireEvent.click(within(popover).getByRole("button", { name: "July 20, 2026" }));

    await waitFor(() => {
      expect(mocks.loadCheckRuns).toHaveBeenLastCalledWith({
        cursor: undefined,
        filter: "all",
        projectId: "project_1",
        provider: "all",
        range: "24h",
        endAt: "2026-07-20T21:59:59.999Z",
        trigger: "all",
      });
    });
    expect(screen.getByRole("button", { name: "As of: Jul 20, 2026" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "7d" }));
    await waitFor(() => {
      expect(mocks.loadCheckRuns).toHaveBeenLastCalledWith({
        cursor: undefined,
        endAt: "2026-07-20T21:59:59.999Z",
        filter: "all",
        projectId: "project_1",
        provider: "all",
        range: "7d",
        trigger: "all",
      });
    });
  });

  it("refetches provider and trigger filters with a reset cursor", async () => {
    useViewport("slim");
    mocks.loadCheckRuns.mockResolvedValue({ ...checkRunsFixtureView, nextCursor: null });
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Filter by provider" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "SerpAPI" }));
    await waitFor(() => {
      expect(mocks.loadCheckRuns).toHaveBeenLastCalledWith({
        cursor: undefined,
        filter: "all",
        projectId: "project_1",
        provider: "serpapi",
        range: "7d",
        trigger: "all",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Filter by trigger" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Manual" }));
    await waitFor(() => {
      expect(mocks.loadCheckRuns).toHaveBeenLastCalledWith({
        cursor: undefined,
        filter: "all",
        projectId: "project_1",
        provider: "serpapi",
        range: "7d",
        trigger: "manual",
      });
    });
  });
});
