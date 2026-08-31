import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarFooter } from "./SidebarFooter";

describe("SidebarFooter", () => {
  it("carries only the version, with the account control now living in the app header", () => {
    render(<SidebarFooter version="1.2.3" />);

    expect(screen.getByText("v1.2.3")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Docs and self-hosting/ })).toBeNull();
  });

  it("keeps the version aligned to the footer end in the expanded rail", () => {
    render(<SidebarFooter version="1.2.3" />);

    // The line is a fixed 16px flex row in both states, so alignment is justification, not
    // text-align: an auto-height line box differed by ~2px between the two font sizes and
    // pushed the mt-auto utility group above it.
    expect(screen.getByText("v1.2.3")).toHaveClass("ml-auto", "text-[10px]", "h-4");
  });

  it("still shows the version in the collapsed rail, centred and a step smaller", () => {
    render(<SidebarFooter collapsed version="1.2.3" />);

    const line = screen.getByText("v1.2.3");
    expect(line).toBeVisible();
    expect(line).toHaveClass("justify-center", "text-[9px]", "h-4");
    expect(line).not.toHaveClass("ml-auto");
  });

  it("separates the footer from navigation with a 12px top inset", () => {
    const { container } = render(<SidebarFooter showBrand version="1.2.3" />);

    expect(container.firstElementChild).toHaveClass("pt-3");
  });

  it("adds a muted footer lockup only while the rail is expanded", () => {
    const expanded = render(<SidebarFooter showBrand version="1.2.3" />);

    expect(expanded.getByText("bisibility")).toBeVisible();
    expect(expanded.getByText("bisibility").closest("span")).toHaveStyle({
      color: "var(--fg-muted)",
    });
    expanded.unmount();

    render(<SidebarFooter collapsed showBrand version="1.2.3" />);
    expect(screen.queryByText("bisibility")).toBeNull();
    expect(screen.getByText("v1.2.3")).toBeVisible();
  });

  it("renders nothing when neither a desktop brand nor version is requested", () => {
    const { container } = render(<SidebarFooter />);

    expect(container).toBeEmptyDOMElement();
  });
});
