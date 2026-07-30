import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarFooter } from "./SidebarFooter";

vi.mock("@/components/shell/SidebarUserButton", () => ({
  SidebarUserButton: () => <button type="button">Account menu</button>,
}));

describe("SidebarFooter", () => {
  it("keeps resources out of the always-visible sidebar footer", () => {
    render(<SidebarFooter />);

    expect(screen.queryByRole("link", { name: /Docs & self-hosting/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Account menu" })).toBeVisible();
  });
});
