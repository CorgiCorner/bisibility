import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DomainOverviewPricingPopover } from "./DomainOverviewPricingPopover";
import type { DomainOverviewEstimateView } from "./domain-overview-workspace-model";

const estimate: DomainOverviewEstimateView = {
  cached: false,
  costCents: 5.612,
  freshCostCents: 5.612,
  historyCostCents: 12.12,
  keywordPageCostCents: 2.02,
  loading: false,
  pagePageCostCents: 3.03,
  valid: true,
};

function PricingHarness() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button onClick={(event) => setAnchor(event.currentTarget)} type="button">
        How is this priced?
      </button>
      <DomainOverviewPricingPopover
        anchor={anchor}
        estimate={estimate}
        onClose={() => setAnchor(null)}
      />
    </>
  );
}

describe("DomainOverviewPricingPopover", () => {
  it("shows current estimates without wrapping the value column or exposing snapshot internals", () => {
    render(<PricingHarness />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));

    expect(screen.getByText("~$0.06")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("~$0.12")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText(/cached results are free for 12 hours/i)).toBeInTheDocument();
    expect(screen.queryByText(/weekly source snapshot/i)).not.toBeInTheDocument();
    expect(screen.queryByText("shown on Analyze")).not.toBeInTheDocument();
  });

  it("shows the list estimate before a domain has been entered", () => {
    render(
      <DomainOverviewPricingPopover
        anchor={document.body}
        estimate={{
          cached: false,
          costCents: null,
          freshCostCents: null,
          historyCostCents: null,
          keywordPageCostCents: null,
          loading: false,
          pagePageCostCents: null,
          valid: false,
        }}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText("~$0.06")).toBeInTheDocument();
    expect(screen.getByText("~$0.12")).toBeInTheDocument();
    expect(screen.queryByText("enter a domain")).not.toBeInTheDocument();
  });

  it("shows a cached no-data report as free instead of a partial module price", () => {
    render(
      <DomainOverviewPricingPopover
        anchor={document.body}
        estimate={{ ...estimate, cached: true, costCents: 0 }}
        onClose={() => undefined}
      />,
    );

    expect(screen.getAllByText("free from cache")).toHaveLength(2);
    expect(screen.queryByText("~$0.04")).not.toBeInTheDocument();
  });
});
