import type { WidgetId } from "@/lib/dashboard-layout/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWidgetReorder } from "./use-widget-reorder";

const original: WidgetId[] = ["organic_kpis", "position_trend", "movers"];
function ReorderHarness({
  disabled = false,
  order = original,
  drop = vi.fn(),
}: {
  disabled?: boolean;
  order?: WidgetId[];
  drop?: (id: WidgetId, to: number) => void;
}) {
  const [items, setItems] = useState(order);
  const reorder = useWidgetReorder({
    order: items,
    disabled,
    onDrop: (id, to) => {
      drop(id, to);
      const next = items.filter((item) => item !== id);
      next.splice(to, 0, id);
      setItems(next);
    },
  });
  return (
    <>
      <button type="button" onClick={() => setItems([...items].reverse())}>
        Reverse
      </button>
      <button type="button" onClick={() => reorder.cancel()}>
        Cancel drag
      </button>
      <output data-testid="order">{items.join()}</output>
      <div ref={reorder.attachScroller} data-testid="scroller">
        <ol ref={reorder.list}>
          {items.map((item, index) => (
            <li key={item}>
              <button type="button" {...reorder.handleProps(item, index)}>
                {item}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
function box(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 300,
    x: 0,
    y: top,
    width: 300,
    height,
    toJSON: () => ({}),
  };
}
function geometry() {
  const scroller = screen.getByTestId("scroller");
  scroller.scrollTop = 20;
  vi.spyOn(scroller, "getBoundingClientRect").mockImplementation(() => box(100, 300));
  const heights = [40, 80, 60];
  let offset = 0;
  for (const [index, row] of [...scroller.querySelectorAll("li")].entries()) {
    const start = offset;
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(() =>
      box(100 + start - scroller.scrollTop, heights[index]),
    );
    offset += heights[index];
  }
  for (const button of scroller.querySelectorAll("button")) {
    let captured = false;
    Object.defineProperties(button, {
      setPointerCapture: {
        value: () => {
          captured = true;
        },
        configurable: true,
      },
      hasPointerCapture: { value: () => captured, configurable: true },
      releasePointerCapture: {
        value: () => {
          captured = false;
        },
        configurable: true,
      },
    });
  }
}
function pointer(handle: HTMLElement, type: string, y: number, pointerId = 1, primary = true) {
  const event = new MouseEvent(type, { clientY: y, button: 0, bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: primary },
  });
  fireEvent(handle, event);
}

describe("pointer dashboard reorder", () => {
  it("uses scrolled variable-height rows and commits once only on drop", () => {
    const drop = vi.fn();
    render(<ReorderHarness drop={drop} />);
    geometry();
    const handle = screen.getByRole("button", { name: "position_trend" });
    pointer(handle, "pointerdown", 160);
    pointer(handle, "pointermove", 90);
    expect(screen.getByTestId("order")).toHaveTextContent(original.join());
    expect(drop).not.toHaveBeenCalled();
    pointer(handle, "pointerup", 90);
    expect(drop).toHaveBeenCalledExactlyOnceWith("position_trend", 0);
    expect(screen.getByTestId("order")).toHaveTextContent("position_trend,organic_kpis,movers");
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "cancel"])(
    "%s aborts without modifying order",
    (ending) => {
      const drop = vi.fn();
      render(<ReorderHarness drop={drop} />);
      geometry();
      const handle = screen.getByRole("button", { name: "position_trend" });
      pointer(handle, "pointerdown", 160);
      pointer(handle, "pointermove", 90);
      if (ending === "blur") fireEvent(window, new Event("blur"));
      else if (ending === "cancel")
        fireEvent.click(screen.getByRole("button", { name: "Cancel drag" }));
      else pointer(handle, ending, 90);
      pointer(handle, "pointerup", 90);
      expect(drop).not.toHaveBeenCalled();
      expect(screen.getByTestId("order")).toHaveTextContent(original.join());
    },
  );

  it("ignores taps and secondary pointers", () => {
    const drop = vi.fn();
    render(<ReorderHarness drop={drop} />);
    geometry();
    const handle = screen.getByRole("button", { name: "position_trend" });
    pointer(handle, "pointerdown", 160);
    pointer(handle, "pointermove", 90, 2, false);
    pointer(handle, "pointerup", 160);
    pointer(handle, "pointerdown", 160, 2, false);
    pointer(handle, "pointermove", 90, 2, false);
    pointer(handle, "pointerup", 90, 2, false);
    expect(drop).not.toHaveBeenCalled();
  });

  it("does not apply a gesture after saving starts or its original order changes", () => {
    const drop = vi.fn();
    const { rerender } = render(<ReorderHarness drop={drop} />);
    geometry();
    const handle = screen.getByRole("button", { name: "position_trend" });
    pointer(handle, "pointerdown", 160);
    pointer(handle, "pointermove", 90);
    rerender(<ReorderHarness drop={drop} disabled />);
    pointer(handle, "pointerup", 90);
    expect(drop).not.toHaveBeenCalled();
    rerender(<ReorderHarness drop={drop} />);
    pointer(handle, "pointerdown", 160);
    pointer(handle, "pointermove", 90);
    fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
    pointer(handle, "pointerup", 90);
    expect(drop).not.toHaveBeenCalled();
  });

  it("releases capture and gesture listeners when the editor unmounts", () => {
    const drop = vi.fn();
    const { unmount } = render(<ReorderHarness drop={drop} />);
    geometry();
    const handle = screen.getByRole("button", { name: "position_trend" }) as HTMLButtonElement;
    pointer(handle, "pointerdown", 160);
    pointer(handle, "pointermove", 90);
    unmount();
    expect(handle.hasPointerCapture(1)).toBe(false);
    act(() => window.dispatchEvent(new Event("blur")));
    expect(drop).not.toHaveBeenCalled();
  });
});
