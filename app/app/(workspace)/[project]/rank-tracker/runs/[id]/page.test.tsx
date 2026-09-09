import { permanentRedirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RankRunDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock("@/lib/queries/_auth", () => ({
  resolveProjectAccess: mocks.resolve,
}));

describe("RankRunDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.resolve.mockResolvedValue({ projectId: "project_1", publicId: "prj_example" });
  });

  it("redirects a rank-check deep link to the canonical Runs detail", async () => {
    await expect(
      RankRunDetailPage({
        params: Promise.resolve({ id: "rcr_abcdefghijklmnopqrstuvwx", project: "prj_example" }),
      }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/app/prj_example/runs/rank-checks/rcr_abcdefghijklmnopqrstuvwx",
    );
    expect(mocks.resolve).toHaveBeenCalledWith("prj_example");
  });

  it("does not turn a non-rcr route value into a fictitious detail", async () => {
    await expect(
      RankRunDetailPage({
        params: Promise.resolve({ id: "check_abcdefghijklmnopqrstuvwx", project: "prj_example" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/app/prj_example/runs?source=rank_checks");
  });
});
