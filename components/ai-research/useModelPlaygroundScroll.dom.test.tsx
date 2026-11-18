import { act, fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useModelPlaygroundScroll } from "./useModelPlaygroundScroll";

it("never writes scrollLeft during small backward scrolls while Add remains visible", () => {
  function Scroller() {
    const { ref, onScroll } = useModelPlaygroundScroll();
    return (
      <section ref={ref} onScroll={onScroll}>
        <div data-add-column />
      </section>
    );
  }
  const { container } = render(<Scroller />);
  const element = container.querySelector("section");
  const tile = element?.querySelector("div");
  if (!element || !tile) throw new Error("Expected scroller and Add tile");
  let position = 600;
  const write = vi.fn((value: number) => {
    position = value;
  });
  Object.defineProperty(element, "scrollLeft", { get: () => position, set: write });
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(
    () => ({ left: 16, right: 374 }) as DOMRect,
  );
  vi.spyOn(tile, "getBoundingClientRect").mockImplementation(
    () => ({ left: 238 + 600 - position, right: 374 + 600 - position }) as DOMRect,
  );
  for (const step of [4, 8, 12, 16, 24]) {
    const before = position;
    position -= step;
    act(() => fireEvent.scroll(element));
    expect(position).toBe(before - step);
    expect(position).toBeLessThan(before);
  }
  expect(write).not.toHaveBeenCalled();
});
