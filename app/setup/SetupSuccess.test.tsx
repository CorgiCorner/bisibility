import { appRootPath } from "@/lib/routing/app-path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupSuccess } from "./SetupSuccess";

describe("SetupSuccess", () => {
  it("makes the project primary while retaining the admin link", () => {
    render(<SetupSuccess mailerConfigured />);

    const workspaceLink = screen.getByRole("link", { name: "Go to your project" });
    const adminLink = screen.getByRole("link", { name: "Open the admin panel" });

    expect(workspaceLink).toHaveAttribute("href", appRootPath());
    expect(workspaceLink).toHaveClass("MuiButton-root");
    expect(adminLink).toHaveAttribute("href", appRootPath("admin"));
    expect(adminLink).toHaveAttribute("target", "_blank");
    expect(adminLink).toHaveAttribute("rel", "noreferrer noopener");
    expect(adminLink).not.toHaveClass("MuiButton-root");
    const icon = adminLink.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("puts the email delivery title on its own line", () => {
    render(<SetupSuccess mailerConfigured={false} />);

    const title = screen.getByText("Next: configure email delivery.");
    expect(title.tagName).toBe("STRONG");
    expect(title).toHaveClass("block");
    expect(
      screen.getByText(/Sign-in codes for other users need a working email provider/),
    ).toBeInTheDocument();
  });
});
