import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResearchPage from "./page";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  cost: vi.fn(),
  demo: vi.fn(),
  health: vi.fn(),
  listStored: vi.fn(),
  markets: vi.fn(),
  readStored: vi.fn(),
  readable: vi.fn(),
  resolve: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/components/demo-research/StoredKeywordResearchView", () => ({
  StoredKeywordResearchView: () => <div data-testid="stored-keyword-research" />,
}));
vi.mock("@/components/demo-research/StoredResultSelector", () => ({
  StoredResultSelector: () => <div data-testid="stored-selector" />,
}));
vi.mock("@/components/research/ResearchWorkspace", () => ({
  ResearchWorkspace: (props: unknown) => {
    mocks.workspace(props);
    return <div data-testid="research-workspace" />;
  },
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/actions/demo-research", () => ({
  listDemoKeywordResearchAction: mocks.listStored,
  readDemoKeywordResearchAction: mocks.readStored,
}));
vi.mock("@/lib/actions/keyword", () => ({ addKeywords: vi.fn() }));
vi.mock("@/lib/actions/keyword-research", () => ({ researchKeywordsAction: vi.fn() }));
vi.mock("@/lib/actions/saved-keyword", () => ({
  removeSavedKeywords: vi.fn(),
  saveKeywords: vi.fn(),
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: vi.fn(() => "viewer") }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: vi.fn(() => false) }));
vi.mock("@/lib/queries/demo-research", () => ({ getDemoResearchAccess: mocks.demo }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.readable,
  resolveProjectAccess: mocks.resolve,
}));
vi.mock("@/lib/queries/check-health", () => ({ getCheckHealth: mocks.health }));
vi.mock("@/lib/queries/cost-calculator", () => ({ getProjectCostContext: mocks.cost }));
vi.mock("@/lib/queries/keyword-research", () => ({ getKeywordResearchPageContext: mocks.context }));
vi.mock("@/lib/queries/project-markets", () => ({ getProjectMarkets: mocks.markets }));

describe("ResearchPage", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.demo.mockResolvedValue({
      actorKind: "viewer",
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.listStored.mockResolvedValue([{ requestKey: "a".repeat(64), seed: "saved seed" }]);
    mocks.readStored.mockResolvedValue({ rows: [] });
    mocks.cost.mockResolvedValue({});
    mocks.readable.mockResolvedValue({ actor: {}, project: { id: "project_1" } });
  });

  it("uses a stored result before every provider-aware page query", async () => {
    mocks.context.mockRejectedValueOnce(new Error("stored mode must not load provider context"));
    mocks.cost.mockRejectedValueOnce(new Error("stored mode must not calculate costs"));
    mocks.health.mockRejectedValueOnce(new Error("stored mode must not load health"));
    mocks.markets.mockRejectedValueOnce(new Error("stored mode must not load markets"));
    mocks.resolve.mockRejectedValueOnce(new Error("stored mode must not resolve normal access"));
    render(
      await ResearchPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({
          demoManage: "1",
          saved: "a".repeat(64),
          seed: "missing seed",
        }),
      }),
    );

    expect(screen.getByTestId("stored-keyword-research")).toBeInTheDocument();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.markets).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.readStored).toHaveBeenCalledWith({
      projectId: "prj_1",
      requestKey: "a".repeat(64),
    });
  });

  it("renders an empty stored state without a reader lookup", async () => {
    mocks.listStored.mockResolvedValue([]);
    mocks.readStored.mockRejectedValueOnce(new Error("empty stored mode must not read"));

    render(
      await ResearchPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ seed: "missing seed" }),
      }),
    );

    expect(screen.getByTestId("stored-keyword-research")).toBeInTheDocument();
    expect(mocks.readStored).not.toHaveBeenCalled();
  });

  it("allows only the Owner to deliberately enter the normal workspace", async () => {
    mocks.demo.mockResolvedValue({
      actorKind: "owner",
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.resolve.mockResolvedValue({ publicId: "prj_1" });
    mocks.context.mockResolvedValue({});
    mocks.health.mockResolvedValue({});
    mocks.markets.mockResolvedValue({});

    render(
      await ResearchPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ demoManage: "1" }),
      }),
    );

    expect(screen.getByTestId("research-workspace")).toBeInTheDocument();
    expect(screen.getByText("Back to saved results")).toBeInTheDocument();
    expect(mocks.context).toHaveBeenCalledWith("prj_1");
  });
});
