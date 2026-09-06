import { ApiNotFoundError } from "@/lib/api/errors";
import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RankRunDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  getRole: vi.fn(),
  listItems: vi.fn(),
  readable: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/components/rank-runs/RunPage", () => ({
  RunPage: (props: { canMutate: boolean; nextCursor: string | null; projectRef: string }) => (
    <div
      data-can-mutate={props.canMutate}
      data-next-cursor={props.nextCursor}
      data-project-ref={props.projectRef}
      data-testid="run-page"
    />
  ),
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getRole }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: () => true }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.readable,
  resolveProjectAccess: mocks.resolve,
}));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRun: mocks.getRun,
  listRankCheckRunItems: mocks.listItems,
}));

describe("RankRunDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRole.mockReturnValue("owner");
    mocks.getRun.mockResolvedValue({ id: "rcr_example" });
    mocks.listItems.mockResolvedValue({ data: [], nextCursor: "cursor-next" });
    mocks.readable.mockResolvedValue({ actor: { id: "user_1" }, project: { id: "project_1" } });
    mocks.resolve.mockResolvedValue({ projectId: "project_1", publicId: "prj_example" });
  });

  it("loads the existing run detail and item APIs through authenticated project access", async () => {
    render(
      await RankRunDetailPage({
        params: Promise.resolve({ id: "rcr_example", project: "prj_example" }),
      }),
    );

    expect(mocks.resolve).toHaveBeenCalledWith("prj_example");
    expect(mocks.readable).toHaveBeenCalledWith("prj_example");
    expect(mocks.getRun).toHaveBeenCalledWith("project_1", "rcr_example");
    expect(mocks.listItems).toHaveBeenCalledWith("project_1", "rcr_example", expect.any(URL));
    expect(screen.getByTestId("run-page")).toHaveAttribute("data-project-ref", "prj_example");
  });

  it("renders not found for a foreign or unknown run", async () => {
    mocks.getRun.mockRejectedValueOnce(new ApiNotFoundError("Rank-check run not found."));
    const missing = new Error("NEXT_NOT_FOUND");
    vi.mocked(notFound).mockImplementationOnce(() => {
      throw missing;
    });

    await expect(
      RankRunDetailPage({
        params: Promise.resolve({ id: "rcr_missing", project: "prj_example" }),
      }),
    ).rejects.toBe(missing);
    expect(notFound).toHaveBeenCalledOnce();
  });
});
