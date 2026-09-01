import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RememberedWebsiteCue } from "./RememberedWebsiteCue";

describe("RememberedWebsiteCue", () => {
  it("shows a safe host label over the verified favicon layer", () => {
    const { container } = render(
      <RememberedWebsiteCue website="https://www.Example.com/path?<strong>raw</strong>" />,
    );

    expect(screen.getByText("Setting up tracking for")).toHaveClass("text-xs");
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(container.querySelector("strong")).toBeNull();
    const fallback = screen.getByText("e");
    const chip = screen.getByText("example.com").parentElement;
    const cue = chip?.parentElement;
    expect(cue).toHaveClass("mb-4", "gap-1", "text-[11px]");
    expect(chip).toHaveClass("gap-1", "py-0.5", "pr-2", "pl-1.5");
    expect(fallback).toHaveClass("size-4", "rounded-[4px]", "text-[8px]");

    const probe = screen.getByTestId("remembered-website-favicon-probe");
    Object.defineProperties(probe, {
      naturalHeight: { configurable: true, value: 32 },
      naturalWidth: { configurable: true, value: 32 },
    });
    fireEvent.load(probe);

    expect(screen.getByTestId("remembered-website-favicon")).toHaveStyle({
      backgroundImage: 'url("https://www.google.com/s2/favicons?domain=www.example.com&sz=32")',
      backgroundSize: "cover",
    });
  });

  it("keeps escaped text and a letter fallback when no safe favicon host exists", () => {
    const website = "<em>raw website</em>";
    const { container } = render(<RememberedWebsiteCue website={website} />);

    expect(screen.getByText(website)).toBeInTheDocument();
    expect(screen.getByText("<")).toBeInTheDocument();
    expect(container.querySelector("em")).toBeNull();
    expect(screen.queryByTestId("remembered-website-favicon-probe")).not.toBeInTheDocument();
  });
});
