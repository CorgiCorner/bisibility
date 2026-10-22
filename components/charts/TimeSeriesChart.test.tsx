import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import sharedMessages from "@/messages/core/en/shared.json";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { TimeSeriesChart } from "./TimeSeriesChart";

describe("TimeSeriesChart date labels", () => {
  it("uses explicit locale display dates for its axis and tooltip payload", () => {
    const observers = stubResizeObserver();
    render(
      <FeatureMessagesProvider
        locale="es-ES"
        messages={sharedMessages}
        timeZone={DEFAULT_TIME_ZONE}
      >
        <DateFormatProvider value="day_first">
          <DateDisplayProvider>
            <TimeSeriesChart
              dateKeys={["2026-08-24", "2026-08-25"]}
              height={180}
              labels={["raw-first", "raw-second"]}
              series={[{ color: "var(--accent)", label: "Visits", values: [12, 18] }]}
              xTickIndexes={[0]}
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
    expect(screen.getByText("24 de agosto de 2026")).toBeInTheDocument();
    expect(screen.queryByText("25 de agosto de 2026")).not.toBeInTheDocument();
    const chart = screen.getByRole("application");
    act(() => {
      chart.focus();
      fireEvent.keyDown(chart, { key: "ArrowRight" });
      fireEvent.keyDown(chart, { key: "ArrowRight" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("25 de agosto de 2026");
    expect(screen.queryByText("raw-second")).not.toBeInTheDocument();
  });
});

function clipBox(container: HTMLElement, clipUrl: string) {
  const id = /^url\(#(.*)\)$/u.exec(clipUrl)?.[1];
  const rect = [...container.querySelectorAll("clipPath")]
    .find((node) => node.id === id)
    ?.querySelector("rect");
  if (!rect) return null;
  return { height: Number(rect.getAttribute("height")), y: Number(rect.getAttribute("y")) };
}

describe("TimeSeriesChart dots", () => {
  it("draws full circles outside the plot clip for a series with dots", () => {
    const observers = stubResizeObserver();
    const { container } = render(
      <FeatureMessagesProvider locale="en" messages={sharedMessages} timeZone={DEFAULT_TIME_ZONE}>
        <DateFormatProvider value="month_first">
          <DateDisplayProvider>
            <TimeSeriesChart
              height={180}
              labels={["first", "second"]}
              max={5}
              min={1}
              reversed
              series={[
                {
                  color: "var(--accent)",
                  dots: true,
                  fill: true,
                  label: "Area",
                  values: [1, 4],
                },
                { color: "var(--fg)", dots: true, label: "Line", values: [1, 3] },
              ]}
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

    const dots = [
      ...container.querySelectorAll("circle.recharts-area-dot, circle.recharts-line-dot"),
    ];
    expect(dots).toHaveLength(4);
    expect(container.querySelector("circle.recharts-area-dot")).toHaveAttribute("r", "3");
    expect(container.querySelector("circle.recharts-area-dot")).toHaveAttribute(
      "fill",
      "var(--accent)",
    );
    expect(container.querySelector("circle.recharts-area-dot")).toHaveAttribute(
      "stroke",
      "var(--bg-elev)",
    );
    const curveClips = new Set(
      [...container.querySelectorAll("g")].flatMap((group) => {
        const clip = group.getAttribute("clip-path");
        if (!clip || !group.querySelector("path.recharts-area-curve, path.recharts-line-curve")) {
          return [];
        }
        return [clip];
      }),
    );
    expect(curveClips.size).toBeGreaterThan(0);

    let extendsPastPlot = false;
    for (const dot of dots) {
      let ownClip: string | null = null;
      let node: Element | null = dot.parentElement;
      while (node && node !== container) {
        const clip = node.getAttribute("clip-path");
        if (clip) {
          expect(curveClips.has(clip)).toBe(false);
          ownClip ??= clip;
        }
        node = node.parentElement;
      }
      expect(ownClip).toEqual(expect.any(String));
      const own = clipBox(container, ownClip ?? "");
      const cy = Number(dot.getAttribute("cy"));
      const radius = Number(dot.getAttribute("r"));
      expect(own).not.toBeNull();
      expect(cy - radius).toBeGreaterThanOrEqual((own?.y ?? 0) - 0.5);
      expect(cy + radius).toBeLessThanOrEqual((own?.y ?? 0) + (own?.height ?? 0) + 0.5);
      for (const clip of curveClips) {
        const plot = clipBox(container, clip);
        if (plot && cy - radius < plot.y - 0.5) extendsPastPlot = true;
      }
    }
    expect(extendsPastPlot).toBe(true);
  });
});
