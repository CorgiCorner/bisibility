import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mui/material/Tooltip", () => import("@/tests/mui-tooltip"));
vi.mock("./UserMenu", () => ({ UserMenu: () => null }));

import { SidebarUserButton } from "./SidebarUserButton";

describe("SidebarUserButton", () => {
  it("labels the collapsed account button with a right-aligned tooltip", () => {
    render(<SidebarUserButton collapsed />);

    const button = screen.getByRole("button", { name: "Account menu" });
    expect(button.closest("[data-tooltip]")).toHaveAttribute("data-tooltip", "Account menu");
    expect(button.closest("[data-tooltip]")).toHaveAttribute("data-tooltip-placement", "right");
  });

  it("suppresses the expanded account tooltip", () => {
    render(<SidebarUserButton />);

    expect(
      screen.getByRole("button", { name: "Account menu" }).closest("[data-tooltip]"),
    ).toHaveAttribute("data-tooltip", "");
  });
});
