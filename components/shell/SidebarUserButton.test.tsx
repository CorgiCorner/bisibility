import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./UserMenu", () => ({ UserMenu: () => null }));

import { SidebarUserButton } from "./SidebarUserButton";

describe("SidebarUserButton", () => {
  // The button moved from the sidebar foot into the header's right cluster, beside two other
  // icon buttons that carry no tooltip. Its aria-label already named it, so the tooltip was a
  // second accessible name competing with the first.
  it("names the collapsed account button without wrapping it in a tooltip", () => {
    render(<SidebarUserButton collapsed />);

    const button = screen.getByRole("button", { name: "Account menu" });
    expect(button.closest("[data-tooltip]")).toBeNull();
  });

  it("keeps the same accessible name when expanded", () => {
    render(<SidebarUserButton />);

    const button = screen.getByRole("button", { name: "Account menu" });
    expect(button.closest("[data-tooltip]")).toBeNull();
  });

  it("uses the standard border on the 32px collapsed avatar for initials and images", () => {
    const { rerender } = render(<SidebarUserButton collapsed />);

    const button = screen.getByRole("button", { name: "Account menu" });
    const initialsAvatar = button.firstElementChild;
    expect(button).toHaveClass("h-8", "w-8", "border-0");
    expect(initialsAvatar).toHaveClass("h-8", "w-8", "border", "border-border");
    expect(initialsAvatar).not.toHaveClass("border-border-control");

    rerender(
      <SidebarUserButton
        collapsed
        user={{
          avatarUrl: "https://example.com/avatar.png",
          email: "member@example.com",
          name: "Member Example",
        }}
      />,
    );

    const imageAvatar = screen.getByRole("button", { name: "Account menu" }).querySelector("img");
    expect(imageAvatar).toHaveClass("h-8", "w-8", "border", "border-border");
    expect(imageAvatar).not.toHaveClass("border-border-control");
  });

  it("renders the server-derived avatar URL", () => {
    render(
      <SidebarUserButton
        user={{
          avatarUrl: "https://example.com/avatar.png",
          email: "member@example.com",
          name: "Member Example",
        }}
      />,
    );

    expect(document.querySelector('img[src="https://example.com/avatar.png"]')).not.toBeNull();
  });
});
