import { stubResizeObserver } from "@/tests/observers";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline";

function renderChart(data: readonly (number | null)[], color?: string) {
  const observers = stubResizeObserver();
  const view = render(<Sparkline ariaLabel="Monthly volume trend" data={data} color={color} />);
  act(() => {
    for (const observer of observers)
      observer.trigger([{ contentRect: { width: 92, height: 34 } } as ResizeObserverEntry]);
  });
  return view;
}

describe("Sparkline", () => {
  it("keeps an accessible label for incomplete history", () => {
    renderChart([10, null, 20]);
    expect(screen.getByRole("img", { name: "Monthly volume trend" })).toBeInTheDocument();
  });

  it.each(["var(--accent)", "var(--green-text)", "var(--red-text)"])(
    "shows a lone stored observation in %s without creating a trend segment",
    (color) => {
      const { container } = renderChart([6], color);
      const dots = container.querySelectorAll("circle.recharts-line-dot");
      expect(dots).toHaveLength(1);
      expect(dots[0]).toHaveAttribute("fill", color);
      expect(dots[0]).toHaveAttribute("stroke", color);
      expect(
        container.querySelector("path.recharts-line-curve")?.getAttribute("d") ?? "",
      ).not.toContain("L");
    },
  );

  it("shows isolated observations and keeps nulls as gaps without forward-filling", () => {
    const data = [10, null, 20, 25];
    const { container } = renderChart(data);
    expect(container.querySelectorAll("circle.recharts-line-dot")).toHaveLength(1);
    const path = container.querySelector("path.recharts-line-curve")?.getAttribute("d") ?? "";
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path.match(/L/g)).toHaveLength(1);
    expect(data).toEqual([10, null, 20, 25]);
  });
  it("does not invent observations when every history point is missing", () => {
    const { container } = renderChart([null, null, null]);
    expect(container.querySelectorAll("circle.recharts-line-dot")).toHaveLength(0);
    expect(container.querySelector("path.recharts-line-curve")?.getAttribute("d") ?? "").toBe("");
  });

  it("keeps a dense connected history as a readable line without permanent dot crowding", () => {
    const { container } = renderChart(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(container.querySelectorAll("circle.recharts-line-dot")).toHaveLength(0);
    const path = container.querySelector("path.recharts-line-curve")?.getAttribute("d") ?? "";
    expect(path.match(/L/g)).toHaveLength(29);
  });
});
