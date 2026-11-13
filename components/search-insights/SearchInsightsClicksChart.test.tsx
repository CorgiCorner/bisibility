import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsClicksChart } from "./SearchInsightsClicksChart";

const { chart } = vi.hoisted(() => ({ chart: vi.fn() }));

vi.mock("@/components/charts/TimeSeriesChart", () => ({
  TimeSeriesChart: (props: unknown) => {
    chart(props);
    return <div data-testid="clicks-chart" />;
  },
}));

const marker = {
  dateKey: "2026-11-02",
  id: "note",
  kind: "note" as const,
  title: "Title change",
};

describe("SearchInsightsClicksChart", () => {
  it("shows an empty state when the property has no stored clicks", () => {
    render(
      <SearchInsightsClicksChart
        points={[
          { clicks: null, dateKey: "2026-11-01" },
          { clicks: null, dateKey: "2026-11-02" },
        ]}
        projectId="prj_1"
      />,
    );

    expect(screen.getByText("No clicks in this window")).toBeInTheDocument();
    expect(screen.queryByTestId("clicks-chart")).not.toBeInTheDocument();
    expect(chart).not.toHaveBeenCalled();
  });

  it("plots finalized clicks with markers and hides the markers from the toggle", async () => {
    const user = userEvent.setup();
    render(
      <SearchInsightsClicksChart
        markers={[marker]}
        points={[
          { clicks: 4, dateKey: "2026-11-01" },
          { clicks: null, dateKey: "2026-11-02" },
        ]}
        projectId="prj_1"
      />,
    );

    expect(chart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dateKeys: ["2026-11-01", "2026-11-02"],
        markerProjectRef: "prj_1",
        markers: [marker],
        series: [expect.objectContaining({ values: [4, null] })],
      }),
    );
    expect(screen.getByRole("link", { name: "Open Annotations" })).toHaveAttribute(
      "href",
      "/app/prj_1/annotations",
    );
    const legend = screen.getByRole("switch", { name: "Markers" }).closest("[data-tab-strip]");
    expect(
      screen.getByTestId("clicks-chart").compareDocumentPosition(legend ?? document.body),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await user.click(screen.getByRole("switch", { name: "Markers" }));
    expect(screen.getByRole("switch", { name: "Markers" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /Note/ })).not.toBeInTheDocument();
  });
});
