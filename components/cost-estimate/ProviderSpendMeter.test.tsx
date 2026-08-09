import { usageProviderSpend as twoProviders } from "@/components/settings/settings-fixtures";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderSpendMeter } from "./ProviderSpendMeter";

const docsHref = "https://bisibility.com/docs/integrations#budget-cap";
const editBudgetHref = "/app/prj_example/settings#provider-usage";

describe("ProviderSpendMeter header variant", () => {
  it("renders label, amounts, session meta and the docs link with meter semantics", async () => {
    render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        editBudgetHref={editBudgetHref}
        sessionCents={9}
        spentCents={1240}
        variant="header"
      />,
    );

    expect(screen.getByText("PROVIDER SPEND")).toBeInTheDocument();
    expect(screen.getByText("$12.40 / $50.00")).toBeInTheDocument();
    expect(screen.queryByText("$0.09 this session")).not.toBeInTheDocument();
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "50");
    expect(meter).toHaveAttribute("aria-valuenow", "12.4");
    expect(meter).toHaveAttribute(
      "aria-label",
      "Provider spend: $12.40 of $50.00 this month, $0.09 this session",
    );
    fireEvent.click(screen.getByRole("button", { name: "About provider spend" }));
    expect(await screen.findByText("$0.09 this session")).toBeInTheDocument();
    const docsLink = await screen.findByRole("link", { name: "How budgets work" });
    expect(docsLink).toHaveAttribute("href", docsHref);
    expect(docsLink).toHaveAttribute("target", "_blank");
    expect(docsLink).toHaveAttribute("rel", "noreferrer noopener");
    expect(screen.getByRole("link", { name: "Edit budget" })).toHaveAttribute(
      "href",
      editBudgetHref,
    );
  });

  it("moves a zero session amount from the meter row into the tooltip", async () => {
    render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        editBudgetHref={editBudgetHref}
        sessionCents={0}
        spentCents={1240}
        variant="header"
      />,
    );

    expect(screen.queryByText("$0.00 this session")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "About provider spend" }));
    expect(await screen.findByText("$0.00 this session")).toBeInTheDocument();
  });

  it("swaps the meta line to the percentage and recolors at the warning threshold", () => {
    const { container } = render(
      <ProviderSpendMeter capCents={5000} docsHref={docsHref} spentCents={4300} variant="header" />,
    );

    expect(screen.getByText("86% of cap")).toHaveClass("text-yellow-text");
    expect(screen.getByText("$43.00 / $50.00")).toHaveClass("text-yellow-text");
    expect(container.querySelector(".bg-yellow")).not.toBeNull();
  });

  it("reads cap reached and recolors red when the cap is exhausted", () => {
    const { container } = render(
      <ProviderSpendMeter capCents={5000} docsHref={docsHref} spentCents={5000} variant="header" />,
    );

    expect(screen.getByText("cap reached")).toHaveClass("text-red-text");
    expect(screen.getByText("$50.00 / $50.00")).toHaveClass("text-red-text");
    expect(container.querySelector(".bg-red")).not.toBeNull();
  });

  it("keeps a single-color aggregate bar and no legend with multiple providers", () => {
    const { container } = render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        providers={twoProviders}
        sessionCents={9}
        spentCents={1240}
        variant="header"
      />,
    );

    expect(container.querySelector(".bg-accent")).not.toBeNull();
    expect(screen.queryByText("DataForSEO $9.40")).not.toBeInTheDocument();
  });

  it("hides the bar and shows month-only amounts when no cap is set", async () => {
    const { container } = render(
      <ProviderSpendMeter capCents={null} docsHref={docsHref} spentCents={1240} variant="header" />,
    );

    expect(screen.getByText("$12.40 this month")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(container.querySelector(".bg-bg-sunken")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About provider spend" }));
    expect(await screen.findByRole("link", { name: "How budgets work" })).toBeInTheDocument();
  });
});

describe("ProviderSpendMeter segmented variant", () => {
  it("splits the fill into provider segments with a legend", () => {
    const { container } = render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        providers={twoProviders}
        spentCents={1240}
        variant="segmented"
      />,
    );

    expect(screen.getByText("DataForSEO $9.40")).toBeInTheDocument();
    expect(screen.getByText("SerpApi $3.00")).toBeInTheDocument();
    const squares = container.querySelectorAll('span[aria-hidden="true"]');
    expect(squares[0]).toHaveStyle({ backgroundColor: "var(--accent)" });
    expect(squares[1]).toHaveStyle({ backgroundColor: "var(--yellow)" });
  });

  it("groups providers under 1% of the cap into a faint Other segment", () => {
    render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        providers={[
          { label: "DataForSEO", spentCents: 1210 },
          { label: "SerpApi", spentCents: 30 },
        ]}
        spentCents={1240}
        variant="segmented"
      />,
    );

    expect(screen.getByText("Other $0.30")).toBeInTheDocument();
    expect(screen.queryByText("SerpApi $0.30")).not.toBeInTheDocument();
  });

  it("overrides segmentation with the warning color while keeping the legend", () => {
    const { container } = render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        providers={[
          { label: "DataForSEO", spentCents: 3400 },
          { label: "SerpApi", spentCents: 900 },
        ]}
        spentCents={4300}
        variant="segmented"
      />,
    );

    expect(container.querySelector(".bg-yellow")).not.toBeNull();
    expect(screen.getByText("DataForSEO $34.00")).toBeInTheDocument();
    const squares = container.querySelectorAll('span[aria-hidden="true"]');
    expect(squares[0]).toHaveStyle({ backgroundColor: "var(--yellow)" });
  });

  it("renders a single-color bar without a legend for one provider", () => {
    const { container } = render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        providers={[{ label: "DataForSEO", spentCents: 1240 }]}
        spentCents={1240}
        variant="segmented"
      />,
    );

    expect(container.querySelector(".bg-accent")).not.toBeNull();
    expect(screen.queryByText("DataForSEO $12.40")).not.toBeInTheDocument();
  });

  it("renders an action control between the amounts and the docs link", () => {
    render(
      <ProviderSpendMeter
        action={<button type="button">Edit budget</button>}
        capCents={5000}
        docsHref={docsHref}
        spentCents={1240}
        variant="segmented"
      />,
    );

    expect(screen.getByRole("button", { name: "Edit budget" })).toBeInTheDocument();
  });
});

describe("ProviderSpendMeter card variant", () => {
  it("renders the big amount, cap suffix, session and pinned on-pace lines", () => {
    render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        onPaceCents={1750}
        sessionCents={9}
        spentCents={1240}
        variant="card"
      />,
    );

    expect(screen.getByText("$12.40")).toBeInTheDocument();
    expect(screen.getByText("of $50.00 cap")).toBeInTheDocument();
    expect(screen.getByText("$0.09 this session")).toBeInTheDocument();
    expect(screen.getByText("on pace ~$17.50/mo")).toBeInTheDocument();
  });

  it("computes the on-pace projection from the pinned now date", () => {
    render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        now={new Date("2026-07-22T12:00:00.000Z")}
        spentCents={1240}
        variant="card"
      />,
    );

    // 1240 cents over 22 of 31 July days extrapolates to 1747 cents.
    expect(screen.getByText("on pace ~$17.47/mo")).toBeInTheDocument();
  });

  it("suppresses the on-pace line during the first two days of the month", () => {
    render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        now={new Date("2026-07-01T12:00:00.000Z")}
        sessionCents={9}
        spentCents={1240}
        variant="card"
      />,
    );

    expect(screen.queryByText(/on pace/)).not.toBeInTheDocument();
    expect(screen.getByText("$0.09 this session")).toBeInTheDocument();
  });

  it("shows the exhausted tail and red fill when the card reaches its cap", () => {
    const { container } = render(
      <ProviderSpendMeter
        capCents={5000}
        docsHref={docsHref}
        onPaceCents={5000}
        spentCents={5000}
        variant="card"
      />,
    );

    expect(screen.getByText("cap reached")).toHaveClass("text-red-text");
    expect(container.querySelector(".bg-red")).not.toBeNull();
  });
});
