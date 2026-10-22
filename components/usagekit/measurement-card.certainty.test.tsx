import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MeasurementCard } from "./measurement-card";

it("keeps measured certainty by default for existing consumers", () => {
  render(
    <MeasurementCard
      title="Outside Usage"
      value={{ text: "239", unit: "units", certainty: "measured" }}
    />,
  );
  expect(screen.getByText("Measured")).toBeInTheDocument();
});
it.each(["estimated", "unknown"] as const)(
  "keeps %s visible when measured labels are hidden",
  (certainty) => {
    render(
      <MeasurementCard
        hideMeasured
        title="Usage"
        value={{ text: certainty === "unknown" ? "" : "239", unit: "units", certainty }}
      />,
    );
    expect(
      screen.getAllByText(certainty === "unknown" ? "Unknown" : "Estimated").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Measured")).toBeNull();
  },
);
it("keeps unavailable evidence visible instead of zero", () => {
  render(<MeasurementCard hideMeasured title="Usage" value="unavailable" />);
  expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  expect(screen.queryByText("0")).toBeNull();
});
