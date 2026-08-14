import { redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
}));

vi.mock("@/lib/queries/workspaces", () => ({
  listWorkspaces: mocks.listWorkspaces,
}));

import AppEntryPage from "./page";

describe("app entry page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("sends an account with only incomplete projects to onboarding", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      { onboardingCompletedAt: null, publicId: "prj_incomplete" },
    ]);

    await expect(AppEntryPage()).rejects.toThrow("NEXT_REDIRECT:/onboarding");

    expect(redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("opens the first completed project instead of an earlier incomplete one", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      { onboardingCompletedAt: null, publicId: "prj_incomplete" },
      {
        onboardingCompletedAt: new Date("2026-08-01T07:30:00.000Z"),
        publicId: "prj_complete",
      },
    ]);

    await expect(AppEntryPage()).rejects.toThrow("NEXT_REDIRECT:/app/prj_complete/dashboard");

    expect(redirect).toHaveBeenCalledWith("/app/prj_complete/dashboard");
  });
});
