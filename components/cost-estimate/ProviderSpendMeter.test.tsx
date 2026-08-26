import { ProviderSpendMeter } from "@/components/cost-estimate/ProviderSpendMeter";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ProviderSpendMeter", () => {
  it("renders the allocation-aware header meter and recorded totals title", () => {
    const { container } = render(
      <ProviderSpendMeter
        capCents={null}
        docsHref="/docs"
        recorded={{ cents: 10, units: 28 }}
        spentCents={10}
        tightest={{ provider: "SerpApi", usedPercent: 100 }}
        usedPercent={100}
        variant="header"
      />,
    );
    expect(screen.getByText("BUDGET")).toBeInTheDocument();
    expect(screen.getByText("SerpApi 100% used")).toBeInTheDocument();
    expect(screen.getByTitle("$0.10 + 28 searches recorded this month")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/utili(?:zation|sation)/i);
  });
  it("uses an explicit no-budget state without a bar", () => {
    render(
      <ProviderSpendMeter
        capCents={null}
        docsHref="/docs"
        spentCents={0}
        tightest={null}
        usedPercent={null}
        variant="header"
      />,
    );
    expect(screen.getByText("No budget set")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
  it("keeps the segmented variant available for its dedicated surface", () => {
    render(
      <ProviderSpendMeter capCents={5000} docsHref="/docs" spentCents={1240} variant="segmented" />,
    );
    expect(screen.getByText("$12.40 of $50.00 used")).toBeInTheDocument();
  });
});
