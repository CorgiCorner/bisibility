import { checkRunsFixtureView } from "@/components/checks/runs/check-runs-fixtures";
import { upcomingViewFixture } from "@/components/checks/upcoming/upcoming-fixtures";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCheckRunsView: vi.fn(),
  getRequestSerpProviderChain: vi.fn(),
  getUpcomingView: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/lib/queries/_auth", () => ({
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/check-runs", () => ({
  getCheckRunsView: mocks.getCheckRunsView,
  getUpcomingView: mocks.getUpcomingView,
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestSerpProviderChain: mocks.getRequestSerpProviderChain,
}));

import ChecksPage from "./page";

describe("checks page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.getCheckRunsView.mockResolvedValue(checkRunsFixtureView);
    mocks.getRequestSerpProviderChain.mockResolvedValue([
      { isPrimary: true, provider: "dataforseo" },
    ]);
    mocks.getUpcomingView.mockResolvedValue(upcomingViewFixture);
  });

  it("renders the integrated upcoming and runs sections", async () => {
    render(await ChecksPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(screen.getAllByLabelText("Upcoming checks")).not.toHaveLength(0);
    expect(screen.getByRole("table", { name: "Check runs" })).toBeInTheDocument();
    expect(mocks.getCheckRunsView).toHaveBeenCalledWith(
      "prj_1",
      expect.objectContaining({ limit: 50, range: "7d", status: "all" }),
    );
    expect(mocks.getUpcomingView).toHaveBeenCalledWith(
      "prj_1",
      expect.objectContaining({ now: expect.any(Date) }),
    );
    expect(mocks.getRequestSerpProviderChain).toHaveBeenCalledWith("project_1");
  });
});
