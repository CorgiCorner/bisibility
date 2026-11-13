import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import sharedMessages from "@/messages/core/en/shared.json";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { PinControl } from "./ChartMarkerPins";
import { CHART_MARKER_PIN_RADIUS } from "./chart-marker-layout";
import { TimeSeriesChart } from "./TimeSeriesChart";

function plotSpan(container: HTMLElement) {
  const rects = [...container.querySelectorAll("clipPath")].flatMap((clip) => [...clip.children]);
  const rect = rects.sort(
    (left, right) => Number(right.getAttribute("width")) - Number(left.getAttribute("width")),
  )[0];
  if (!rect) return null;
  return {
    height: Number(rect.getAttribute("height")),
    width: Number(rect.getAttribute("width")),
    x: Number(rect.getAttribute("x")),
    y: Number(rect.getAttribute("y")),
  };
}

describe("TimeSeriesChart marker pin geometry", () => {
  it("draws a full lettered circle inside the plot span, including the first and last day", () => {
    const observers = stubResizeObserver();
    const { container } = render(
      <FeatureMessagesProvider locale="en" messages={sharedMessages} timeZone={DEFAULT_TIME_ZONE}>
        <DateFormatProvider value="month_first">
          <DateDisplayProvider>
            <TimeSeriesChart
              dateKeys={["2026-11-01", "2026-11-02", "2026-11-03"]}
              height={180}
              labels={["a", "b", "c"]}
              markers={[
                { dateKey: "2026-11-01", id: "note", kind: "note", title: "Start" },
                { dateKey: "2026-11-02", id: "deploy", kind: "deploy", title: "Release" },
                { dateKey: "2026-11-02", id: "content", kind: "content", title: "Copy" },
                { dateKey: "2026-11-03", id: "google", kind: "search_engine", title: "Update" },
              ]}
              series={[{ color: "var(--accent)", label: "Visits", values: [1, 2, 3] }]}
            />
          </DateDisplayProvider>
        </DateFormatProvider>
      </FeatureMessagesProvider>,
    );
    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 180, width: 600 } } as ResizeObserverEntry]);
      }
    });

    const plot = plotSpan(container);
    expect(plot).not.toBeNull();
    const pins = [...container.querySelectorAll('circle[data-chart-marker="pin"]')];
    expect(pins).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Note, Nov 1, 2026" })).toHaveTextContent("N");
    expect(screen.getByRole("button", { name: "2 annotations, Nov 2, 2026" })).toHaveTextContent(
      "2",
    );
    expect(screen.getByRole("button", { name: "Google update, Nov 3, 2026" })).toHaveTextContent(
      "G",
    );
    const guides = [...container.querySelectorAll('line[data-chart-marker="guide"]')];
    expect(guides).toHaveLength(pins.length);
    const curve = container.querySelector("path.recharts-line-curve, path.recharts-area-curve");
    expect(curve).not.toBeNull();
    for (const pin of pins) {
      const cx = Number(pin.getAttribute("cx"));
      const cy = Number(pin.getAttribute("cy"));
      const radius = Number(pin.getAttribute("r"));
      const letter = pin.parentElement?.querySelector("button, a")?.textContent?.trim() ?? "";
      expect(radius).toBe(CHART_MARKER_PIN_RADIUS);
      expect(letter.length).toBeGreaterThan(0);
      expect(cx - radius).toBeGreaterThanOrEqual((plot?.x ?? 0) - 0.01);
      expect(cx + radius).toBeLessThanOrEqual((plot?.x ?? 0) + (plot?.width ?? 0) + 0.01);
      expect(cy - radius).toBeGreaterThanOrEqual(0);
      const guide = guides.find((line) => Number(line.getAttribute("x1")) === cx);
      expect(guide).toBeDefined();
      expect(Number(guide?.getAttribute("x2"))).toBeCloseTo(cx);
      expect(Number(guide?.getAttribute("y1"))).toBeCloseTo(cy + radius);
      expect(Number(guide?.getAttribute("y2"))).toBeCloseTo((plot?.y ?? 0) + (plot?.height ?? 0));
      expect(guide?.getAttribute("stroke-dasharray")).toBe("3 3");
      if (guide && curve) {
        expect(
          guide.compareDocumentPosition(curve) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    }
  });
});

describe("pin hover card interactions", () => {
  function control(href?: string) {
    const active = vi.fn();
    const inactive = vi.fn();
    render(
      <div>
        <PinControl
          href={href}
          name="Marker"
          onActive={active}
          onInactive={inactive}
          tooltip={<a href="/app/prj_test/annotations?q=entry">Entry</a>}
        >
          N
        </PinControl>
        <button type="button">Outside</button>
      </div>,
    );
    return { active, inactive, pin: screen.getByLabelText("Marker") };
  }
  it("opens on pointer enter, closes on leave and gives clusters no navigation target", async () => {
    const { active, inactive, pin } = control();
    fireEvent.pointerEnter(pin, { pointerType: "mouse" });
    expect(active).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("link", { name: "Entry" })).toHaveAttribute(
      "href",
      "/app/prj_test/annotations?q=entry",
    );
    fireEvent.click(pin);
    expect(pin).not.toHaveAttribute("href");
    fireEvent.pointerLeave(pin, { pointerType: "mouse" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(inactive).toHaveBeenCalled();
  });
  it("keeps keyboard focus on Escape and uses only a designed focus-visible ring", () => {
    const { pin } = control("/app/prj_test/annotations?q=entry");
    act(() => pin.focus());
    fireEvent.keyDown(pin, { key: "Escape" });
    expect(pin).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pin).toHaveClass(
      "outline-none",
      "rounded-full",
      "focus-visible:ring-2",
      "focus-visible:ring-accent-solid",
      "focus-visible:ring-offset-2",
    );
    expect(
      pin.className
        .split(" ")
        .filter((name) => name.includes("outline") && name !== "outline-none"),
    ).toEqual([]);
    expect(pin).toHaveAttribute("href", "/app/prj_test/annotations?q=entry");
  });
  it("opens on the first touch and closes on an outside tap", async () => {
    const { pin } = control("/app/prj_test/annotations?q=entry");
    fireEvent.pointerDown(pin, { pointerType: "touch", button: 0 });
    fireEvent.click(pin);
    expect(screen.getByRole("dialog")).toBeVisible();
    await userEvent.pointer([
      { keys: "[TouchA>]", target: screen.getByRole("button", { name: "Outside" }) },
      { keys: "[/TouchA]" },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
