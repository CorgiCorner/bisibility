import { ProviderSpendMeter } from "@/components/cost-estimate/ProviderSpendMeter";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ProviderSpendMeter", () => {
  it("keeps the segmented variant available for its dedicated surface", () => {
    render(
      <ProviderSpendMeter capCents={5000} docsHref="/docs" spentCents={1240} variant="segmented" />,
    );
    expect(screen.getByText("$12.40 of $50.00 used")).toBeInTheDocument();
  });

  it("shows month spend without a cap in the card variant", () => {
    render(<ProviderSpendMeter capCents={null} docsHref="/docs" spentCents={0} variant="card" />);
    expect(screen.getByText("this month")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
});
