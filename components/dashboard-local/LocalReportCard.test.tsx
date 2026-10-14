import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocalReportCard } from "./LocalReportCard";
import { localStoryReport } from "./test-fixtures";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: object) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useFormatter: () => ({
    number: (value: number, options?: { style?: string }) =>
      options?.style === "percent" ? `${value * 100}%` : String(value),
    dateTime: (value: Date) => value.toISOString(),
  }),
}));
vi.mock("@/components/measurement-help/LocalizedMeasurementHelp", () => ({
  LocalizedMeasurementHelp: () => <span>help</span>,
}));
describe("Local report summary consumer", () => {
  it("shows distinct full-cohort metrics and actual asOf without recalculation", () => {
    const { container } = render(<LocalReportCard report={localStoryReport} />);
    expect(screen.getByText("75%")).toBeVisible();
    expect(screen.getByText("50%")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(container.querySelector("time")).toHaveAttribute("datetime", localStoryReport.asOf);
    expect(screen.getByText("comparisonUnavailable")).toBeVisible();
  });
  it("preserves unknown and zero as different states", () => {
    render(
      <LocalReportCard
        report={{ ...localStoryReport, presence: 0, targetTop3: null, freshness: "unknown" }}
      />,
    );
    expect(screen.getByText("0%")).toBeVisible();
    expect(screen.getByText("unknown")).toBeVisible();
    expect(screen.getByText("freshnessUnknown")).toBeVisible();
  });
});
