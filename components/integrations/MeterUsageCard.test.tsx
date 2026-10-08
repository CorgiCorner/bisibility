import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MeterUsageCard } from "./MeterUsageCard";
import { emptyMeterUsage, partialMeterUsage } from "./meter-usage-fixtures";

it("renders absence of observations without a confirmed zero or complete total", () => {
  const { container } = render(<MeterUsageCard data={emptyMeterUsage} />);
  expect(screen.getByText(/Usage is unavailable, not a confirmed zero/)).toBeInTheDocument();
  expect(screen.getByText(/supplemental observations/)).toBeInTheDocument();
  expect(screen.getByText(/credit wallet remains the balance authority/)).toBeInTheDocument();
  expect(container.textContent).not.toContain("USD 0");
});

it("renders unknown exposure, lag, separate charge labels and exact observed costs", () => {
  render(<MeterUsageCard data={partialMeterUsage} />);
  expect(screen.getByText(/spans accounting authorities/)).toBeInTheDocument();
  expect(screen.getByText(/Oldest unresolved operation/)).toBeInTheDocument();
  expect(screen.getByText("USD 0.362000")).toBeInTheDocument();
  expect(screen.getByText("Acknowledged account charge")).toBeInTheDocument();
  expect(screen.getAllByText("Unknown").length).toBeGreaterThan(1);
  expect(screen.getByText("962.2000")).toBeInTheDocument();
});

it("labels separate provider caps while treating empty shadow budget figures as unknown", () => {
  render(
    <MeterUsageCard
      data={{
        ...emptyMeterUsage,
        budgets: [
          {
            ...partialMeterUsage.budgets[0],
            figuresKnown: false,
            used: "0.0000",
            reserved: "0.0000",
          },
          {
            ...partialMeterUsage.budgets[0],
            provider: "SerpApi",
            connection: "prc_other_public",
            figuresKnown: false,
            used: "0.0000",
            reserved: "0.0000",
            limit: "2000.0000",
          },
        ],
      }}
    />,
  );
  expect(screen.queryByText("0.0000")).not.toBeInTheDocument();
  expect(screen.getByText("1000.0000")).toBeInTheDocument();
  expect(
    screen.getByText("Connection · DataForSEO · prc_example · app · cents"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Connection · SerpApi · prc_other_public · app · cents"),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Unknown")).toHaveLength(6);
});

it.each(["unavailable", "restricted"] as const)(
  "renders %s without sensitive amounts",
  (status) => {
    const { container } = render(<MeterUsageCard data={{ ...partialMeterUsage, status }} />);
    expect(container.textContent).not.toContain("USD");
    expect(container.textContent).not.toContain("962.2000");
    expect(screen.getByRole("status")).toBeInTheDocument();
  },
);
