import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupProgressRing } from "./SetupProgressRing";

describe("SetupProgressRing", () => {
  it.each([
    [1, 4, "12.6 50.3"],
    [3, 4, "37.7 50.3"],
    [4, 4, "50.3 50.3"],
  ])("calculates the SVG arc for %i of %i", (settledCount, totalCount, dasharray) => {
    const { container } = render(
      <SetupProgressRing settledCount={settledCount} totalCount={totalCount} />,
    );
    const ring = container.querySelector("[data-progress-ring]");
    const arc = container.querySelector("[data-progress-arc]");

    expect(ring).toHaveAttribute("width", "22");
    expect(ring).toHaveAttribute("height", "22");
    expect(arc).toHaveAttribute("stroke-dasharray", dasharray);
    expect(arc).toHaveAttribute("stroke-linecap", "round");
    expect(arc).toHaveAttribute("transform", "rotate(-90 10 10)");
  });
});
