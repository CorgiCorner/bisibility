import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CostEstimateLine } from "./CostEstimateLine";

describe("CostEstimateLine", () => {
  it("renders checks, money, delta, and budget context", () => {
    render(
      <CostEstimateLine
        budget={{ capCents: 5000, spentCents: 1250 }}
        checksPerMonth={1200}
        costCents={250}
        deltaCents={50}
      />,
    );

    expect(screen.getByText(/~1,200 checks\/mo/)).toHaveTextContent(
      "~1,200 checks/mo \u00b7 ~$2.50/mo (+$0.50/mo) \u00b7 $12.50 of $50.00 this month",
    );
  });

  it("shows counts without money when the rate is unknown", () => {
    render(<CostEstimateLine checksPerMonth={30} costCents={null} />);
    expect(screen.getByText("~30 checks/mo")).toBeInTheDocument();
  });
});
