import { redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  listWorkspaces: vi.fn(),
}));

vi.mock("@/lib/queries/workspaces", () => ({
  listWorkspaces: mocks.listWorkspaces,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import AppEntryPage from "./page";

function cookieStore(values: Record<string, string>) {
  return { get: vi.fn((key: string) => (key in values ? { value: values[key] } : undefined)) };
}

describe("app entry page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.cookies.mockResolvedValue(cookieStore({}));
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

  it("redirects to the stored landing preference for the completed workspace", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      {
        onboardingCompletedAt: new Date("2026-08-01T07:30:00.000Z"),
        publicId: "prj_complete",
      },
    ]);
    mocks.cookies.mockResolvedValue(cookieStore({ pref_landing: "rank-tracker" }));

    await expect(AppEntryPage()).rejects.toThrow("NEXT_REDIRECT:/app/prj_complete/rank-tracker");

    expect(redirect).toHaveBeenCalledWith("/app/prj_complete/rank-tracker");
  });

  it("migrates the legacy overview landing cookie to dashboard", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      {
        onboardingCompletedAt: new Date("2026-08-01T07:30:00.000Z"),
        publicId: "prj_complete",
      },
    ]);
    mocks.cookies.mockResolvedValue(cookieStore({ pref_landing: "overview" }));

    await expect(AppEntryPage()).rejects.toThrow("NEXT_REDIRECT:/app/prj_complete/dashboard");

    expect(redirect).toHaveBeenCalledWith("/app/prj_complete/dashboard");
  });

  it("falls back to dashboard when the landing cookie is invalid", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      {
        onboardingCompletedAt: new Date("2026-08-01T07:30:00.000Z"),
        publicId: "prj_complete",
      },
    ]);
    mocks.cookies.mockResolvedValue(cookieStore({ pref_landing: "nonsense" }));

    await expect(AppEntryPage()).rejects.toThrow("NEXT_REDIRECT:/app/prj_complete/dashboard");

    expect(redirect).toHaveBeenCalledWith("/app/prj_complete/dashboard");
  });
});
