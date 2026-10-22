import { DOCS_URL } from "@/lib/site/site";
import { redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listWorkspaces: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
}));
vi.mock("@/lib/queries/workspaces", () => ({
  listWorkspaces: mocks.listWorkspaces,
}));

import InstallEntryPage from "./page";

describe("install entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("sends a visitor without a session to the agents docs", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(InstallEntryPage()).rejects.toThrow(`NEXT_REDIRECT:${DOCS_URL}/agents`);

    expect(redirect).toHaveBeenCalledWith(`${DOCS_URL}/agents`);
    expect(mocks.listWorkspaces).not.toHaveBeenCalled();
  });

  it("sends a signed-in account to the default project's install page", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.listWorkspaces.mockResolvedValue([
      {
        isDefault: false,
        onboardingCompletedAt: new Date("2026-08-01T07:30:00.000Z"),
        publicId: "prj_oldercompleted00000000",
      },
      {
        isDefault: true,
        onboardingCompletedAt: new Date("2026-08-02T07:30:00.000Z"),
        publicId: "prj_defaultcompleted000000",
      },
    ]);

    await expect(InstallEntryPage()).rejects.toThrow(
      "NEXT_REDIRECT:/app/prj_defaultcompleted000000/install",
    );

    expect(redirect).toHaveBeenCalledWith("/app/prj_defaultcompleted000000/install");
  });

  it("sends a signed-in account with no completed project to onboarding", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.listWorkspaces.mockResolvedValue([
      { isDefault: true, onboardingCompletedAt: null, publicId: "prj_incomplete00000000000" },
    ]);

    await expect(InstallEntryPage()).rejects.toThrow("NEXT_REDIRECT:/onboarding");

    expect(redirect).toHaveBeenCalledWith("/onboarding");
  });
});
