import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const openSupport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/support/open-support", () => ({ openSupport }));

// Renders the tooltip body inline so the help text and its link can be asserted.
vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children, content }: { children: ReactNode; content: ReactNode }) => (
    <span>
      {children}
      <span data-testid="tooltip-content">{content}</span>
    </span>
  ),
}));

async function openSwitcher(projectLimit: { canContactSupport: boolean; limit: number } | null) {
  render(
    <WorkspaceSwitcher
      activeProjectId={mockWorkspaces[0].id}
      canCreateWorkspace
      projectLimit={projectLimit}
      workspaces={mockWorkspaces}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
  await screen.findByRole("menu", { name: "Projects" });
}

describe("WorkspaceSwitcher project limit", () => {
  beforeEach(() => {
    openSupport.mockClear();
  });

  it("links Create project while the account is under its limit", async () => {
    await openSwitcher(null);

    expect(screen.getByRole("menuitem", { name: "Create project" })).toHaveAttribute(
      "href",
      "/onboarding?new=1",
    );
    expect(screen.queryByTestId("workspace-create-blocked")).toBeNull();
  });

  it("blocks Create project and opens in-app support with a prefilled request", async () => {
    await openSwitcher({ canContactSupport: true, limit: 3 });

    const row = screen.getByRole("menuitem", { name: "Create project" });
    expect(row).not.toHaveAttribute("href");
    expect(within(row).getByText("3 projects limit reached")).toBeInTheDocument();
    expect(screen.queryByText("Collaborate with others in a new project")).toBeNull();
    expect(
      within(row.parentElement as HTMLElement).getByTestId("tooltip-content"),
    ).toHaveTextContent(
      "Your account can own up to 3 projects. Click to contact support and raise the limit",
    );

    fireEvent.click(row);

    expect(openSupport).toHaveBeenCalledWith({
      message: "Hi, I'd like to raise my project limit. My account can own up to 3 projects.",
    });
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Projects" })).toBeNull();
    });
  });

  it("only states the limit when the build has no support channel", async () => {
    await openSwitcher({ canContactSupport: false, limit: 1 });

    const row = screen.getByRole("menuitem", { name: "Create project" });
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(within(row).getByText("1 project limit reached")).toBeInTheDocument();
    expect(within(row.parentElement as HTMLElement).queryByTestId("tooltip-content")).toBeNull();
    fireEvent.click(row);
    expect(openSupport).not.toHaveBeenCalled();
    expect(screen.getByRole("menu", { name: "Projects" })).toBeInTheDocument();
  });
});
