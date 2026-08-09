import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/app/app/(workspace)/workspace-shell", () => ({
  WorkspaceShell: ({
    activeProjectId,
    children,
    projectRef,
  }: {
    activeProjectId: string;
    children: ReactNode;
    projectRef: string;
  }) => (
    <div data-active-project-id={activeProjectId} data-project-ref={projectRef} data-shell-root>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/queries/workspaces", () => ({
  listWorkspaces: mocks.listWorkspaces,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import AccountLayout from "./layout";

describe("account layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWorkspaces.mockResolvedValue([
      {
        id: "project_1",
        onboardingCompletedAt: new Date("2026-08-01T07:30:00.000Z"),
        publicId: "prj_example",
      },
    ]);
  });

  it("keeps account pages inside the workspace shell", async () => {
    const result = await AccountLayout({ children: <div>Account content</div> });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain("data-shell-root");
    expect(markup).toContain('data-active-project-id="project_1"');
    expect(markup).toContain('data-project-ref="prj_example"');
    expect(markup).toContain("Account content");
  });

  it("sends project-less accounts through onboarding", async () => {
    mocks.listWorkspaces.mockResolvedValueOnce([]);
    mocks.redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT:/onboarding");
    });

    await expect(AccountLayout({ children: <div>Hidden</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("sends accounts with only incomplete projects through onboarding", async () => {
    mocks.listWorkspaces.mockResolvedValueOnce([
      { id: "project_1", onboardingCompletedAt: null, publicId: "prj_example" },
    ]);
    mocks.redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT:/onboarding");
    });

    await expect(AccountLayout({ children: <div>Hidden</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });
});
