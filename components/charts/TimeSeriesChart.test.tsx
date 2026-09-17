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
