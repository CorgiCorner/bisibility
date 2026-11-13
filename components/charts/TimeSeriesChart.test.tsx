import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import { timeSeriesAxisNumber, timeSeriesCategoryTicks } from "@/lib/charts/time-series-axis";
import sharedMessages from "@/messages/core/en/shared.json";
import plSharedMessages from "@/messages/core/pl/shared.json";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, render, screen } from "@testing-library/react";
import { act, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  chartMarkerPreferenceKey,
  resetChartMarkerPreferenceStores,
} from "./chart-marker-preference";
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
    expect(screen.getByText("24 de agosto")).toBeInTheDocument();
    expect(screen.queryByText("24 de agosto de 2026")).not.toBeInTheDocument();
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

function chartFrame(chart: ReactNode) {
  return (
    <FeatureMessagesProvider locale="en" messages={sharedMessages} timeZone={DEFAULT_TIME_ZONE}>
      <DateFormatProvider value="month_first">
        <DateDisplayProvider>{chart}</DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>
  );
}

describe("TimeSeriesChart markers", () => {
  const dateKeys = ["2026-11-01", "2026-11-02", "2026-11-03"];
  const series = [{ color: "var(--accent)", label: "Visits", values: [1, 2, 3] }];

  it("draws lettered pins and a rollout band, and omits both when markers are absent", () => {
    const observers = stubResizeObserver();
    const view = render(
      chartFrame(
        <TimeSeriesChart
          dateKeys={dateKeys}
          height={180}
          labels={["a", "b", "c"]}
          markers={[
            { dateKey: "2026-11-02", id: "note", kind: "note", title: "Title change" },
            { dateKey: "2026-11-02", id: "deploy", kind: "deploy", title: "Release" },
            {
              dateKey: "2026-11-01",
              endDateKey: "2026-11-03",
              id: "google",
              kind: "search_engine",
              title: "Core update",
            },
          ]}
          series={series}
        />,
      ),
    );
    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 180, width: 600 } } as ResizeObserverEntry]);
      }
    });

    const cluster = screen.getByRole("button", { name: "2 annotations, Nov 2, 2026" });
    expect(cluster).not.toHaveAccessibleName(/Title change/);
    expect(cluster).toHaveAccessibleDescription(/Title change/);
    expect(cluster).toHaveAccessibleDescription(/Release/);
    expect(screen.getByRole("button", { name: "Google update, Nov 1, 2026" })).toHaveTextContent(
      "G",
    );
    expect(view.container.querySelector(".recharts-reference-area")).toBeInTheDocument();

    view.rerender(
      chartFrame(
        <TimeSeriesChart
          dateKeys={dateKeys}
          height={180}
          labels={["a", "b", "c"]}
          series={series}
        />,
      ),
    );
    expect(
      screen.queryByRole("button", { name: /annotations|Core update/ }),
    ).not.toBeInTheDocument();
    expect(view.container.querySelector(".recharts-reference-area")).not.toBeInTheDocument();
  });

  it("translates a generated pin for the viewer locale and keeps notes verbatim", () => {
    const observers = stubResizeObserver();
    render(
      <FeatureMessagesProvider locale="pl" messages={plSharedMessages} timeZone={DEFAULT_TIME_ZONE}>
        <DateFormatProvider value="day_first">
          <DateDisplayProvider>
            <TimeSeriesChart
              dateKeys={dateKeys}
              height={180}
              labels={["a", "b", "c"]}
              markers={[
                {
                  added: 2,
                  dateKey: "2026-11-02",
                  generated: "sitemapTitle",
                  id: "sitemap",
                  kind: "sitemap",
                  removed: 1,
                  title: "",
                },
                { dateKey: "2026-11-02", id: "note", kind: "note", title: "FAQ added" },
                {
                  dateKey: "2026-11-03",
                  id: "google",
                  kind: "search_engine",
                  title: "November spam update",
                },
              ]}
              series={series}
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

    const cluster = screen.getByRole("button", { name: /adnotacji/ });
    expect(cluster).toHaveAccessibleDescription(/Mapa witryny: dodano 2, usunięto 1/);
    expect(cluster).toHaveAccessibleDescription(/FAQ added/);
    expect(cluster).not.toHaveAccessibleName(/FAQ added/);
    const google = screen.getByRole("button", { name: /Aktualizacja Google/ });
    expect(google).toHaveAccessibleDescription(/November spam update/);
    expect(google).not.toHaveAccessibleName(/November spam update/);
    expect(screen.queryByRole("button", { name: /Sitemap:/ })).not.toBeInTheDocument();
  });

  it("omits a kind the project has turned off, including its guide and band", () => {
    resetChartMarkerPreferenceStores();
    localStorage.setItem(
      chartMarkerPreferenceKey("prj_markers"),
      JSON.stringify({
        enabled: true,
        kinds: {
          content: true,
          deploy: true,
          note: false,
          search_engine: false,
          sitemap: true,
        },
      }),
    );
    const observers = stubResizeObserver();
    const { container } = render(
      chartFrame(
        <TimeSeriesChart
          dateKeys={dateKeys}
          height={180}
          labels={["a", "b", "c"]}
          markerProjectRef="prj_markers"
          markers={[
            { dateKey: "2026-11-01", id: "note", kind: "note", title: "FAQ" },
            {
              dateKey: "2026-11-02",
              id: "deploy",
              kind: "deploy",
              source: "production",
              title: "Ship",
            },
            {
              dateKey: "2026-11-01",
              endDateKey: "2026-11-03",
              id: "google",
              kind: "search_engine",
              title: "Core update",
            },
          ]}
          series={series}
        />,
      ),
    );
    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 180, width: 600 } } as ResizeObserverEntry]);
      }
    });

    expect(screen.queryByRole("link", { name: /Note/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Google update/ })).not.toBeInTheDocument();
    const deploy = screen.getByRole("link", { name: "Deploy, Nov 2, 2026" });
    expect(deploy).toHaveAttribute("href", "/app/prj_markers/annotations?q=deploy");
    expect(deploy).toHaveAccessibleDescription(/Ship/);
    expect(deploy).toHaveAccessibleDescription(/Deploy · production/);
    expect(deploy).not.toHaveAccessibleName(/Ship/);
    expect(container.querySelectorAll('line[data-chart-marker="guide"]')).toHaveLength(1);
    expect(container.querySelector(".recharts-reference-area")).not.toBeInTheDocument();
  });

  it("describes a cluster without repeating its name, and caps the list", () => {
    const observers = stubResizeObserver();
    render(
      chartFrame(
        <TimeSeriesChart
          dateKeys={["2026-11-01"]}
          height={180}
          labels={["a"]}
          markers={Array.from({ length: 6 }, (_, index) => ({
            dateKey: "2026-11-01",
            id: `entry-${index}`,
            kind: "note" as const,
            title: `Entry ${index}`,
          }))}
          series={[{ color: "var(--accent)", label: "Visits", values: [1] }]}
        />,
      ),
    );
    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 180, width: 600 } } as ResizeObserverEntry]);
      }
    });

    const cluster = screen.getByRole("button", { name: "6 annotations, Nov 1, 2026" });
    expect(cluster).toHaveTextContent("6");
    for (const index of [0, 1, 2, 3, 4]) {
      expect(cluster).toHaveAccessibleDescription(new RegExp(`Entry ${index}`));
    }
    expect(cluster).not.toHaveAccessibleDescription(/Entry 5/);
    expect(cluster).toHaveAccessibleDescription(/\+1 more/);
  });

  it("opens the pin hover card on focus and closes it on Escape", () => {
    const observers = stubResizeObserver();
    const { container } = render(
      chartFrame(
        <TimeSeriesChart
          dateKeys={dateKeys}
          height={180}
          labels={["a", "b", "c"]}
          markers={[
            { dateKey: "2026-11-01", id: "note", kind: "note", title: "FAQ" },
            { dateKey: "2026-11-02", id: "deploy", kind: "deploy", title: "Ship" },
          ]}
          series={series}
        />,
      ),
    );
    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 180, width: 600 } } as ResizeObserverEntry]);
      }
    });

    const pin = screen.getByRole("button", { name: "Note, Nov 1, 2026" });
    fireEvent.keyDown(document, { key: "Tab" });
    act(() => pin.focus());
    expect(screen.getByRole("dialog")).toHaveTextContent("FAQ");
    const guides = [...container.querySelectorAll('line[data-chart-marker="guide"]')];
    const solid = guides.filter((line) => line.getAttribute("stroke-dasharray") === null);
    expect(solid).toHaveLength(1);
    fireEvent.keyDown(pin, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists the day's annotations under the crosshair value", () => {
    const observers = stubResizeObserver();
    render(
      chartFrame(
        <TimeSeriesChart
          dateKeys={["2026-11-01", "2026-11-02"]}
          height={180}
          labels={["a", "b"]}
          markers={[{ dateKey: "2026-11-02", id: "note", kind: "note", title: "FAQ added" }]}
          series={[{ color: "var(--accent)", label: "Visits", values: [1, 2] }]}
        />,
      ),
    );
    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 180, width: 600 } } as ResizeObserverEntry]);
      }
    });

    const chart = screen.getByRole("application");
    act(() => {
      chart.focus();
      fireEvent.keyDown(chart, { key: "ArrowRight" });
      fireEvent.keyDown(chart, { key: "ArrowRight" });
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("FAQ added");
    expect(status).toHaveTextContent("N");
    expect(status).toHaveTextContent("Visits");
  });
});

describe("TimeSeriesChart axis defaults", () => {
  it("keeps a compact top tick, short day labels, and thinned x ticks", () => {
    const observers = stubResizeObserver();
    const days = Array.from({ length: 30 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return `2026-10-${day}`;
    });
    const { container } = render(
      chartFrame(
        <TimeSeriesChart
          dateKeys={days}
          height={220}
          labels={days}
          series={[{ color: "var(--accent)", label: "Clicks", values: days.map(() => 10000) }]}
        />,
      ),
    );
    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 220, width: 640 } } as ResizeObserverEntry]);
      }
    });

    const topTick = timeSeriesAxisNumber(10000, "en", true);
    const tick = screen.getAllByText(topTick)[0];
    expect(tick).toBeDefined();
    expect(screen.queryByText("10,000")).not.toBeInTheDocument();
    expect(screen.queryByText("0000")).not.toBeInTheDocument();
    expect(Number(tick?.getAttribute("x") ?? "0")).toBeGreaterThanOrEqual(0);
    expect(screen.getByText("Oct 1")).toBeInTheDocument();
    expect(screen.queryByText("Oct 1, 2026")).not.toBeInTheDocument();
    const ticks = timeSeriesCategoryTicks(days.length);
    expect(screen.queryByText("Oct 2")).not.toBeInTheDocument();
    expect(screen.getByText("Oct 30")).toBeInTheDocument();
    expect(container.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick").length).toBe(
      ticks.length,
    );
  });
});
