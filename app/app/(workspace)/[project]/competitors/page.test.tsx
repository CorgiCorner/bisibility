import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompetitorsPage from "./page";

const mocks = vi.hoisted(() => ({
  getCompetitorsView: vi.fn(),
  getQueryActor: vi.fn(),
  getSavedView: vi.fn(),
  listSavedViews: vi.fn(),
  listWorkspaces: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/lib/queries/_auth", () => ({
  getQueryActor: mocks.getQueryActor,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/competitors", () => ({ getCompetitorsView: mocks.getCompetitorsView }));
vi.mock("@/lib/queries/saved-views", () => ({
  getSavedView: mocks.getSavedView,
  listSavedViews: mocks.listSavedViews,
}));
vi.mock("@/lib/actions/keyword", () => ({ addKeywords: vi.fn() }));
vi.mock("@/lib/actions/saved-views", () => ({
  createSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
}));
vi.mock("@/lib/queries/workspaces", () => ({ listWorkspaces: mocks.listWorkspaces }));

describe("CompetitorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    mocks.getQueryActor.mockResolvedValue({ id: "actor-1" });
    mocks.getSavedView.mockResolvedValue(null);
    mocks.listSavedViews.mockResolvedValue([]);
    mocks.listWorkspaces.mockResolvedValue([
      {
        domain: "example.com",
        id: "prj_abcdefghijklmnopqrstuvwx",
        keywordCount: 0,
        name: "Example",
        plan: "free",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        role: "owner",
      },
    ]);
  });

  it("keeps managed competitors visible when no keywords are tracked", async () => {
    mocks.getCompetitorsView.mockResolvedValue({
      managedCompetitors: [
        {
          domain: "competitor.example.com",
          id: "competitor_1",
          initials: "CE",
          label: "Competitor",
        },
      ],
      market: null,
      markets: [],
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      scope: null,
      suggestions: [],
    });

    render(
      await CompetitorsPage({
        params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
      }),
    );

    expect(mocks.getCompetitorsView).toHaveBeenCalledWith(
      "prj_abcdefghijklmnopqrstuvwx",
      undefined,
    );
    expect(screen.getByText("No tracked keywords")).toBeInTheDocument();
    expect(screen.getByText(/Competitor/)).toBeInTheDocument();
    expect(screen.queryByText("No competitors yet")).not.toBeInTheDocument();
  });
});
