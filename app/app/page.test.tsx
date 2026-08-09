import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("@/lib/queries/workspaces", () => ({
  listWorkspaces: mocks.listWorkspaces,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import AppEntryPage from "./page";

describe("app entry page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an account with only incomplete projects to onboarding", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      { onboardingCompletedAt: null, publicId: "prj_incomplete" },
    ]);

    await expect(AppEntryPage()).rejects.toThrow("NEXT_REDIRECT:/onboarding");

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("opens the first completed project instead of an earlier incomplete one", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      { onboardingCompletedAt: null, publicId: "prj_incomplete" },
      {
        onboardingCompletedAt: new Date("2026-08-01T07:30:00.000Z"),
        publicId: "prj_complete",
      },
    ]);

    await expect(AppEntryPage()).rejects.toThrow("NEXT_REDIRECT:/app/prj_complete/overview");

    expect(mocks.redirect).toHaveBeenCalledWith("/app/prj_complete/overview");
  });
});
