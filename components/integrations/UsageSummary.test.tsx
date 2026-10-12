import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { budgetFixture, projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { UsageSummary } from "./UsageSummary";

it("hides recorded usage when the actor has no access", () => {
  render(<UsageSummary data={{ ...emptyProjectUsage(), status: "restricted" }} />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(document.querySelector("#meter-usage")).toBeNull();
});
it("returns to the first detail page when refreshed data replaces a longer history", async () => {
  const data = projectUsageFixture();
  data.detail.rows = Array.from({ length: 26 }, (_, index) => ({
    ...data.detail.rows[0],
    key: `row-${index}`,
  }));
  const view = render(<UsageSummary data={data} />);
  await userEvent.click(screen.getByText("Usage details"));
  await userEvent.click(screen.getByRole("button", { name: "Next page" }));
  view.rerender(<UsageSummary data={projectUsageFixture()} />);
  expect(screen.getByRole("table")).toHaveTextContent("$0.12");
  expect(screen.queryByText("No usage in this period.")).toBeNull();
});
it("retains the usage anchor and collapsed details, with source-specific currency amounts", async () => {
  const data = emptyProjectUsage();
  data.status = "available";
  data.detail.state = "empty";
  data.summary = {
    ...data.summary,
    state: "ok",
    complete: true,
    funding: [
      {
        key: "row-0",
        costOwner: "",
        fundingSource: "byok",
        cost: { text: "123.4567", unit: "cents", certainty: "measured" },
        measurements: {},
        unknownOperations: "0",
      },
    ],
    cost: { text: "123.4567", unit: "cents", certainty: "measured" },
  };
  const { container } = render(<UsageSummary data={data} />);
  expect(container.querySelector("#meter-usage")).toBeInTheDocument();
  expect(screen.getByText("$1.23")).toBeInTheDocument();
  expect(container.querySelector("details")).not.toHaveAttribute("open");
  await userEvent.click(screen.getByText("Usage details"));
  expect(container.querySelector("details")).toHaveAttribute("open");
  expect(screen.getByRole("table")).toBeInTheDocument();
});

it("distinguishes confirmed zero measurements from unknown measurements", () => {
  const data = emptyProjectUsage();
  data.status = "available";
  data.summary = {
    ...data.summary,
    state: "ok",
    complete: true,
    measurements: {
      requests: { text: "0", unit: "requests", certainty: "measured" },
      units: { text: "", unit: "units", certainty: "unknown" },
    },
  };
  render(<UsageSummary data={data} />);
  expect(screen.getByText("0")).toBeInTheDocument();
  expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  expect(screen.queryByText("No usage in this period.")).toBeNull();
});
it("shows empty state without inventing observations for configured limits", () => {
  const data = emptyProjectUsage();
  data.status = "available";
  data.summary.state = "empty";
  data.budgets = [
    {
      ...budgetFixture(),
      used: "unavailable",
      reserved: "unavailable",
      remaining: "unavailable",
      level: "unavailable",
    },
  ];
  render(<UsageSummary data={data} />);
  expect(screen.getByText("No usage in this period.")).toBeInTheDocument();
  expect(screen.getByText("100 Units")).toBeInTheDocument();
  expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  expect(screen.queryByText("0")).toBeNull();
});
it("discloses incomplete coverage and truncated details without summing the visible page", async () => {
  const data = projectUsageFixture();
  data.summary.complete = false;
  data.truncated = true;
  render(<UsageSummary data={data} />);
  expect(screen.getAllByText(/could not cover the whole period/).length).toBeGreaterThan(0);
  expect(
    within(screen.getByRole("region", { name: "Provider cost" })).queryByText("$0.12"),
  ).toBeNull();
  await userEvent.click(screen.getByText("Usage details"));
  expect(screen.getByText(/This view is bounded/)).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent("$0.12");
});
