import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BacklinksPage from "./page";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  context: vi.fn(),
  resolve: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/components/backlinks/BacklinksWorkspace", () => ({
  BacklinksWorkspace: (props: unknown) => {
    mocks.workspace(props);
    return <div data-testid="backlinks-workspace" />;
  },
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/actions/backlinks", () => ({
  analyzeBacklinksAction: mocks.analyze,
  loadMoreBacklinkRowsAction: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolve }));
vi.mock("@/lib/queries/backlinks", () => ({ getBacklinksPageContext: mocks.context }));

describe("BacklinksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ publicId: "prj_1" });
    mocks.context.mockResolvedValue({
      costContext: { capCents: 5_000, spentCents: 0 },
      defaultTarget: "project.example",
      recentTargets: [],
    });
    mocks.analyze.mockResolvedValue({
      cached: false,
      costCents: 5,
      estimatedCostCents: 5,
      ok: true,
    });
  });

  it("honors the target query contract from Domain Overview", async () => {
    render(
      await BacklinksPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ target: " linked.example " }),
      }),
    );

    expect(screen.getByTestId("backlinks-workspace")).toBeInTheDocument();
    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ estimateOnly: true, target: "linked.example" }),
    );
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEstimate: { cached: false, costCents: 5, loading: false, valid: true },
        initialTarget: "linked.example",
      }),
    );
  });

  it("does not price a suggested target when the page opens empty", async () => {
    render(
      await BacklinksPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByTestId("backlinks-workspace")).toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ initialEstimate: undefined, initialTarget: "" }),
    );
  });
});
