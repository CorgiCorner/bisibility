import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminProviderUsageTable } from "./AdminProviderUsageTable";

const usage = [
  {
    billableUnits: 12,
    checks: 3,
    provider: "zeta",
    providerLabel: "Zeta Search",
    rateBasis: "Usage plan",
    referenceCostCents: 12,
    referenceCostKnown: true,
  },
  {
    billableUnits: 1,
    checks: 1,
    provider: "alpha",
    providerLabel: "Alpha Search",
    rateBasis: "Live pricing",
    referenceCostCents: 0.2,
    referenceCostKnown: true,
  },
];

describe("AdminProviderUsageTable", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders provider usage and retained reference-cost guidance", () => {
    render(<AdminProviderUsageTable usage={usage} />);

    const table = screen.getByRole("table", { name: "SERP usage this month by provider" });
    for (const heading of [
      "Provider",
      "Completed checks",
      "Requests / units",
      "Reference cost",
      "Rate basis",
    ]) {
      expect(
        within(table).getByRole("columnheader", { name: new RegExp(`^${heading}`) }),
      ).toBeInTheDocument();
    }
    expect(within(table).getByText("$0.12")).toBeInTheDocument();
    expect(screen.getByText(/provider invoices remain authoritative/)).toBeInTheDocument();
  });

  it("sorts provider usage in the client", () => {
    render(<AdminProviderUsageTable usage={usage} />);

    fireEvent.click(screen.getByRole("button", { name: "Sort Provider ascending" }));

    const table = screen.getByRole("table", { name: "SERP usage this month by provider" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0] as HTMLElement).getByText("Alpha Search")).toBeInTheDocument();
  });

  it("reserves room for sortable usage headers and fills a wide table container", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1_200);
    render(<AdminProviderUsageTable usage={usage} />);

    const table = screen.getByRole("table", { name: "SERP usage this month by provider" });
    expect(table.style.getPropertyValue("--dt-table-width")).toBe("1200px");
    expect(table.style.getPropertyValue("--dt-col-checks")).toBe("156px");
    expect(table.style.getPropertyValue("--dt-col-units")).toBe("144px");
    expect(table.style.getPropertyValue("--dt-col-referenceCost")).toBe("140px");
  });

  it("renders the existing empty state without a table", () => {
    render(<AdminProviderUsageTable usage={[]} />);

    expect(screen.getByText("No completed SERP checks this month.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
