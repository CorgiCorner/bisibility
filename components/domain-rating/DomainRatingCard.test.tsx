import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { DomainRatingView } from "@/lib/domain-rating/history";
import messages from "@/messages/core/en/shared.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DomainRatingCard } from "./DomainRatingCard";

vi.mock("@/components/charts/TimeSeriesChart", () => ({
  TimeSeriesChart: ({ series }: { series: { values: (number | null)[] }[] }) => (
    <div data-testid="chart">{JSON.stringify(series[0].values)}</div>
  ),
}));
const data: DomainRatingView = {
  projectId: "prj_example",
  domain: "example.com",
  enabled: true,
  source: "own",
  hasOwnConnection: true,
  points: [
    { day: "2026-08-01", rating: 32 },
    { day: "2026-10-28", rating: 42 },
  ],
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
};
function mount(overrides: Partial<DomainRatingView> = {}) {
  return render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <DateFormatProvider value="month_first">
        <DateDisplayProvider>
          <DomainRatingCard data={{ ...data, ...overrides }} today="2026-10-28" />
        </DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>,
  );
}
describe("DomainRatingCard", () => {
  it("shows linked attribution beside the data and changes the history range", () => {
    mount();
    expect(screen.getByRole("link", { name: "Domain Rating by Ahrefs" })).toHaveAttribute(
      "href",
      "https://ahrefs.com/",
    );
    expect(screen.getByText("+10 over this period")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(screen.getByText("First observation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  });
  it("preserves a zero score and the chart when paused", () => {
    mount({ enabled: false, points: [{ day: "2026-10-28", rating: 0 }] });
    expect(screen.getByLabelText("Latest rating")).toHaveTextContent("0/ 100");
    expect(screen.getByText("Tracking paused", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });
  it("shows a connect link rather than fabricated history", () => {
    mount({ points: [], source: null });
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Domain Rating by Ahrefs" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Ahrefs" })).toHaveAttribute(
      "href",
      "/app/prj_example/providers?connect=ahrefs#provider-ahrefs",
    );
  });
  it("shows attribution for a managed connection before the first observation", () => {
    mount({ points: [], source: "hosted" });
    expect(screen.getByRole("link", { name: "Domain Rating by Ahrefs" })).toBeInTheDocument();
  });
  it("retains attribution with visible historical data after access ends", () => {
    mount({ source: null });
    expect(screen.getByRole("link", { name: "Domain Rating by Ahrefs" })).toBeInTheDocument();
  });
});
