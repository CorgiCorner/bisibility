import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarFooter } from "./SidebarFooter";

describe("SidebarFooter", () => {
  it("carries only the version, with the account control now living in the app header", () => {
    render(<SidebarFooter version="1.2.3" />);

    expect(screen.getByText("v1.2.3")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Docs & self-hosting/ })).toBeNull();
  });

  it("right-aligns the version at 10px in the expanded rail", () => {
    render(<SidebarFooter version="1.2.3" />);

    // The line is a fixed 16px flex row in both states, so alignment is justification, not
    // text-align: an auto-height line box differed by ~2px between the two font sizes and
    // pushed the mt-auto utility group above it.
    expect(screen.getByText("v1.2.3")).toHaveClass("justify-end", "text-[10px]", "pr-1", "h-4");
  });

  it("still shows the version in the collapsed rail, centred and a step smaller", () => {
    render(<SidebarFooter collapsed version="1.2.3" />);

    const line = screen.getByText("v1.2.3");
    expect(line).toBeVisible();
    expect(line).toHaveClass("justify-center", "text-[9px]", "h-4");
    expect(line).not.toHaveClass("pr-1");
  });

  it("renders nothing when the build carries no version", () => {
    const { container } = render(<SidebarFooter />);

    expect(container).toBeEmptyDOMElement();
  });
});
