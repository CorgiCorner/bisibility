import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLockup } from "./BrandLockup";
import { BRAND_MARK_SMALL_CUT, BRAND_MARK_STANDARD_CUT } from "./BrandMark";

describe("BrandLockup", () => {
  it("gives a wrapping link exactly one accessible name", () => {
    const { container } = render(
      <a href="/">
        <BrandLockup />
      </a>,
    );

    // A labelled mark next to the wordmark would read as "bisibility bisibility".
    expect(screen.getByRole("link")).toHaveAccessibleName("bisibility");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("labels the mark when there is no wordmark to carry the name", () => {
    render(<BrandLockup markOnly />);

    expect(screen.getByRole("img")).toHaveAccessibleName("bisibility");
    expect(screen.queryByText("bisibility")).toBeNull();
  });

  it("scales the mark and the type together", () => {
    const { container } = render(<BrandLockup size="hero" />);

    expect(container.querySelector("svg")?.getAttribute("width")).toBe("70");
    expect(screen.getByText("bisibility")).toHaveStyle({ fontSize: "56px" });
  });

  it("drops the small size onto the small cut", () => {
    const { container } = render(<BrandLockup size="sm" />);

    expect(container.querySelector("path")?.getAttribute("d")).toBe(
      `${BRAND_MARK_SMALL_CUT.block} ${BRAND_MARK_SMALL_CUT.counter}`,
    );
  });

  it("uses one fixed scale when stacked", () => {
    const { container } = render(<BrandLockup orientation="stacked" size="sm" />);

    expect(container.querySelector("svg")?.getAttribute("width")).toBe("64");
    expect(container.querySelector("path")?.getAttribute("d")).toBe(
      `${BRAND_MARK_STANDARD_CUT.block} ${BRAND_MARK_STANDARD_CUT.counter}`,
    );
    expect(screen.getByText("bisibility")).toHaveStyle({ fontSize: "26px" });
  });

  it("keeps the wordmark as selectable text", () => {
    render(<BrandLockup />);

    const wordmark = screen.getByText("bisibility");
    expect(wordmark.tagName).toBe("SPAN");
    expect(wordmark).toHaveClass("font-bold", "tracking-[-0.045em]");
  });
});
