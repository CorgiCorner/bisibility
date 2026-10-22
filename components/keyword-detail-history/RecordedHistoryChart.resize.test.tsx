import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { historyPages } from "./history.test-fixture";
import { RecordedHistoryChart } from "./RecordedHistoryChart";

afterEach(() => vi.unstubAllGlobals());

describe("recorded chart responsive geometry", () => {
  it("keeps a one-to-one plot coordinate system on wide and narrow containers", () => {
    const observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] =
      [];
    class Observer {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, disconnect: this.disconnect });
      }
    }
    vi.stubGlobal("ResizeObserver", Observer);
    const onOpen = vi.fn();
    const page = historyPages().observations;
    const { container, unmount } = render(
      <RecordedHistoryChart page={page} onOpen={onOpen} timeZone="UTC" />,
    );
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Expected plotted history");
    let width = 1800;
    Object.defineProperty(svg, "clientWidth", { configurable: true, get: () => width });
    for (const next of [1800, 320]) {
      width = next;
      act(() => {
        for (const { callback } of observers) callback([], {} as ResizeObserver);
      });
      expect(svg).toHaveAttribute("viewBox", `0 0 ${next} 280`);
      expect(svg).not.toHaveAttribute("preserveAspectRatio", "none");
      const firstPoint = svg.querySelector("foreignObject");
      expect(firstPoint).toHaveAttribute("width", "12");
      expect(firstPoint).toHaveAttribute("height", "12");
      expect(svg.querySelector("text")).toHaveAttribute("font-size", "10");
      const lastTick = [...svg.querySelectorAll("text")].at(-1);
      expect(lastTick).toHaveAttribute("x", String(next - 16));
    }
    const observation = page.records.find((record) => record.evidence === "positive");
    if (!observation) throw new Error("Expected positive fixture");
    fireEvent.click(
      screen.getByRole("button", { name: `Open saved observation ${observation.id}` }),
    );
    expect(onOpen).toHaveBeenCalledWith(observation.id);
    unmount();
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
  });
});
