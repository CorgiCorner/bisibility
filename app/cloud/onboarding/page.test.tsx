import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CloudOnboardingPage from "./page";

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  requireSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/queries/workspaces", () => ({ listWorkspaces: mocks.listWorkspaces }));

describe("CloudOnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { email: "owner@example.com" } });
  });

  it("redirects an account that already has a workspace to the app", async () => {
    mocks.listWorkspaces.mockResolvedValue([{ publicId: "prj_abcdefghijklmnopqrstuvwx" }]);

    await expect(CloudOnboardingPage()).rejects.toThrow("redirect:/app");
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });

  it("renders first-workspace choices for an account without a workspace", async () => {
    mocks.listWorkspaces.mockResolvedValue([]);

    render(await CloudOnboardingPage());

    expect(
      screen.getByRole("heading", { name: "How do you want to start your first workspace?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create a new workspace/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Import from a self-hosted instance/ }),
    ).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
