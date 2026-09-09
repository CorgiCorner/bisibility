import { beforeEach, describe, expect, it, vi } from "vitest";
import RankCheckRunPage from "./page";

const mocks = vi.hoisted(() => ({
  getRankCheckRun: vi.fn(),
  listRankCheckRunItems: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  runPage: vi.fn(() => null),
}));

vi.mock("@/components/rank-runs/RunPage", () => ({ RunPage: mocks.runPage }));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: () => "member" }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: () => true }));
vi.mock("@/lib/deployment/project-write-mode", () => ({ isProjectReadOnly: () => false }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRun: mocks.getRankCheckRun,
  listRankCheckRunItems: mocks.listRankCheckRunItems,
}));

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const runId = "rcr_abcdefghijklmnopqrstuvwx";

describe("RankCheckRunPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({ projectId: "project_1", publicId: projectRef });
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1" },
      project: { id: "project_1", writeMode: "active" },
    });
    mocks.getRankCheckRun.mockResolvedValue({ id: runId });
    mocks.listRankCheckRunItems.mockResolvedValue({ data: [{ id: "item_1" }], nextCursor: "next" });
  });

  it("serves the canonical rank-check detail route through the existing RunPage", async () => {
    const rendered = await RankCheckRunPage({
      params: Promise.resolve({ id: runId, project: projectRef }),
    });
    const runPageProps = (rendered.props.children as { props: Record<string, unknown> }).props;

    expect(mocks.getRankCheckRun).toHaveBeenCalledWith("project_1", runId);
    expect(mocks.listRankCheckRunItems).toHaveBeenCalledWith(
      "project_1",
      runId,
      expect.objectContaining({ search: `?project=${projectRef}&limit=20` }),
    );
    expect(runPageProps).toMatchObject({
      canMutate: true,
      nextCursor: "next",
      projectRef,
      run: { id: runId },
    });
  });
});
