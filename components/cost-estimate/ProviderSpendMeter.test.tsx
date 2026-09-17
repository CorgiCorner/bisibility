import { ProviderSpendMeter } from "@/components/cost-estimate/ProviderSpendMeter";
import { renderWithCostEstimateMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
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

  it("keeps money and optional session spend in localized meter accessibility copy", () => {
    render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref="/docs"
        providers={[
          { label: "DataForSEO", spentCents: 4800 },
          { label: "Small provider", spentCents: 20 },
        ]}
        sessionCents={125}
        spentCents={4820}
        variant="card"
      />,
    );

    expect(
      screen.getByRole("meter", { name: /Provider spend: \$48\.20 of \$50\.00 this month/ }),
    ).toBeVisible();
    expect(screen.getByText(/Other \$0\.20/)).toBeVisible();
    expect(screen.getByText("$1.25 this session")).toBeVisible();
  });
});
