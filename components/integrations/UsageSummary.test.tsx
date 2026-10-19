import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { budgetFixture, projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

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
  expect(screen.queryByRole("button", { name: "Amounts" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decimal places" })).toBeNull();
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
it("shows empty state without duplicating project budget cards", () => {
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
  expect(screen.queryByText("100 Units")).toBeNull();
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

it("shows both ends of retained connection IDs and copies the full identifier", async () => {
  const data = projectUsageFixture();
  const connection = "conn_adbea2c178b319ecf9687a76";
  data.connections = [];
  data.detail.rows = data.detail.rows.map((row) => ({
    ...row,
    dimensions: { ...row.dimensions, connection },
  }));
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<UsageSummary data={data} />);
  await act(async () => {
    fireEvent.click(screen.getByText("Usage details"));
  });
  const table = screen.getByRole("table");
  expect(within(table).getByText("conn_adbea…687a76").parentElement).toHaveAttribute(
    "title",
    connection,
  );
  expect(within(table).queryByText(connection)).toBeNull();
  await act(async () => {
    fireEvent.click(within(table).getByRole("button", { name: "Copy ID" }));
  });
  expect(writeText).toHaveBeenCalledExactlyOnceWith(connection);
  expect(data.detail.rows[0].dimensions.connection).toBe(connection);
});

it("keeps a connection without an identifier as a plain retained label", async () => {
  const data = projectUsageFixture();
  data.detail.rows = data.detail.rows.map((row) => ({
    ...row,
    dimensions: { ...row.dimensions, connection: "" },
  }));
  render(<UsageSummary data={data} />);
  await userEvent.click(screen.getByText("Usage details"));
  expect(within(screen.getByRole("table")).queryByRole("button", { name: "Copy ID" })).toBeNull();
});

it("shows the retained SerpAPI customer price as Credits, independently of requests", async () => {
  const data = projectUsageFixture();
  const row = data.detail.rows[0];
  if (!row) throw new Error("Missing usage fixture");
  data.detail.units = ["requests", "customer_cents", "units"];
  data.detail.rows = [
    {
      ...row,
      fundingSource: "platform",
      units: {
        requests: { text: "3", unit: "requests", certainty: "measured" },
        units: { text: "3", unit: "units", certainty: "measured" },
        customer_cents: { text: "13.0001", unit: "customer_cents", certainty: "measured" },
      },
    },
  ];
  render(<UsageSummary data={data} />);
  await userEvent.click(screen.getByText("Usage details"));
  const table = screen.getByRole("table");
  expect(table).toHaveTextContent("13.0001 Credits");
  expect(table).toHaveTextContent("Requests");
  expect(table).not.toHaveTextContent("$0.12");
  expect(within(table).queryByRole("columnheader", { name: "Units" })).toBeNull();
});

it("omits an empty funding counter card while retaining its provider cost", () => {
  const data = projectUsageFixture();
  render(<UsageSummary data={data} />);
  expect(screen.queryByRole("region", { name: "Own key" })).toBeNull();
  expect(screen.getByRole("region", { name: "Provider cost" })).toHaveTextContent("$0.12");
});

it("retains unresolved-operation warnings without an empty card frame", () => {
  const data = projectUsageFixture();
  data.summary.funding = data.summary.funding.map((row) => ({ ...row, unknownOperations: "1" }));
  render(<UsageSummary data={data} />);
  const summary = screen.getByRole("region", { name: "Own key" });
  expect(summary).toHaveTextContent("Operations with unknown measurements: 1");
  expect(summary.querySelector(".border")).toBeNull();
});
