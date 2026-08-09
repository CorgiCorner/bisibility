import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BRAND_MARK_SMALL_CUT, BRAND_MARK_STANDARD_CUT, BrandMark } from "./BrandMark";

function renderMark(element: React.ReactElement) {
  const { container } = render(element);
  const svg = container.querySelector("svg");
  const path = container.querySelector("path");

  if (!svg || !path) {
    throw new Error("BrandMark did not render an svg path");
  }

  return { path, svg };
}

const standardPath = `${BRAND_MARK_STANDARD_CUT.block} ${BRAND_MARK_STANDARD_CUT.counter}`;
const smallPath = `${BRAND_MARK_SMALL_CUT.block} ${BRAND_MARK_SMALL_CUT.counter}`;

describe("BrandMark", () => {
  it("switches to the small cut at the inclusive 18px boundary", () => {
    const { path } = renderMark(<BrandMark size={18} />);

    expect(path.getAttribute("d")).toBe(smallPath);
  });

  it("keeps the standard cut one pixel above the boundary", () => {
    const { path } = renderMark(<BrandMark size={19} />);

    expect(path.getAttribute("d")).toBe(standardPath);
  });

  it("uses the standard cut at the default size", () => {
    const { path, svg } = renderMark(<BrandMark />);

    expect(svg.getAttribute("width")).toBe("26");
    expect(path.getAttribute("d")).toBe(standardPath);
  });

  it("keeps the counter as an evenodd hole", () => {
    const { path, svg } = renderMark(<BrandMark />);

    expect(path.getAttribute("fill-rule")).toBe("evenodd");
    expect(path.getAttribute("fill")).toBe("currentColor");
    expect(svg.style.forcedColorAdjust).toBe("none");
  });

  it("stays decorative without a label", () => {
    const { svg } = renderMark(<BrandMark />);

    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("exposes an image role when labelled", () => {
    const { svg } = renderMark(<BrandMark label="bisibility" />);

    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("bisibility");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
    expect(screen.getByRole("img")).toHaveAccessibleName("bisibility");
  });

  it("maps tones onto the colour the path inherits", () => {
    const { svg } = renderMark(<BrandMark tone="accent" />);

    expect(svg.style.color).toBe("var(--accent)");
  });
});
