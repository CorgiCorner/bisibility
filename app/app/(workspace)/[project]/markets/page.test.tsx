import MarketsPage from "@/app/app/(workspace)/[project]/markets/page";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getArchivedProjectMarkets: vi.fn(),
  getProjectMarkets: vi.fn(),
  props: undefined as unknown,
  requireReadableProject: vi.fn(),
}));

vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/markets/page/MarketsPageContent", () => ({
  MarketsPageContent: (props: unknown) => {
    mocks.props = props;
    return <div data-markets-page-content="">Live markets page</div>;
  },
}));
vi.mock("@/lib/actions/project-market-lifecycle", () => ({
  removeProjectMarketFromProject: vi.fn(),
  restoreProjectMarketFromProject: vi.fn(),
  setProjectMarketEnabled: vi.fn(),
  updateProjectMarket: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/project-markets", () => ({
  getArchivedProjectMarkets: mocks.getArchivedProjectMarkets,
  getProjectMarkets: mocks.getProjectMarkets,
}));

describe("MarketsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.props = undefined;
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "admin" }], role: "viewer" },
      project: { id: "project_1", writeMode: "active" },
    });
    mocks.getProjectMarkets.mockResolvedValue({ markets: [], projectId: "prj_1" });
    mocks.getArchivedProjectMarkets.mockResolvedValue({ markets: [], projectId: "prj_1" });
  });

  it("loads market data on the server and replaces the settings stub", async () => {
    render(await MarketsPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(mocks.getProjectMarkets).toHaveBeenCalledWith("prj_1");
    expect(mocks.getArchivedProjectMarkets).toHaveBeenCalledWith("prj_1");
    expect(mocks.props).toEqual(expect.objectContaining({ canArchive: true, canEdit: true }));
    expect(screen.getByText("Live markets page")).toBeInTheDocument();
    expect(screen.queryByText("Manage markets")).not.toBeInTheDocument();
  });

  it("lets a member archive but keeps restore admin-only", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "member" }], role: "viewer" },
      project: { id: "project_1", writeMode: "active" },
    });

    render(await MarketsPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(mocks.props).toEqual(
      expect.objectContaining({ canArchive: true, canEdit: true, canRestore: false }),
    );
  });

  it("passes the one New market route intent and creation boundary to the page owner", async () => {
    render(
      await MarketsPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ "new-market": "1" }),
      }),
    );

    expect(mocks.props).toEqual(
      expect.objectContaining({
        canCreateMarket: true,
        createMarketAction: expect.any(Function),
        openNewMarket: true,
      }),
    );
  });
});
