import { appRootPath } from "@/lib/routing/app-path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupSuccess } from "./SetupSuccess";

describe("SetupSuccess", () => {
  it("makes the workspace primary while retaining the admin link", () => {
    render(<SetupSuccess mailerConfigured />);

    const workspaceLink = screen.getByRole("link", { name: "Go to your workspace" });
    const adminLink = screen.getByRole("link", { name: "Open the admin panel" });

    expect(workspaceLink).toHaveAttribute("href", appRootPath());
    expect(workspaceLink).toHaveClass("MuiButton-root");
    expect(adminLink).toHaveAttribute("href", appRootPath("admin"));
    expect(adminLink).not.toHaveClass("MuiButton-root");
  });
});
