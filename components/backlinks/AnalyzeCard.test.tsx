import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithBacklinksMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AnalyzeCard } from "./AnalyzeCard";
import { EMPTY_BACKLINKS_ESTIMATE } from "./backlinks-workspace-model";

const baseProps = {
  estimate: EMPTY_BACKLINKS_ESTIMATE,
  includeSubdomains: true,
  onIncludeSubdomainsChange: vi.fn(),
  onLimitChange: vi.fn(),
  onScopeChange: vi.fn(),
  onSubmit: vi.fn(),
  onTargetChange: vi.fn(),
  resultLimit: 100 as const,
  scope: "site" as const,
  target: "",
};

function ScopeHarness() {
  const [scope, setScope] = useState<"page" | "site">("site");
  return (
    <AnalyzeCard
      {...baseProps}
      estimate={{
        cached: false,
        costCents: 5,
        loading: false,
        valid: true,
        payment: paymentQuote(),
      }}
      onScopeChange={setScope}
      scope={scope}
      target="example.com"
    />
  );
}

describe("AnalyzeCard", () => {
  it("does not show a provider choice when only one source is eligible", () => {
    render(
      <AnalyzeCard
        {...baseProps}
        providers={[{ label: "DataForSEO", value: "dataforseo" }]}
        onProviderChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Backlink source" })).not.toBeInTheDocument();
  });

  it("lets the user explicitly choose among eligible sources", async () => {
    const onProviderChange = vi.fn();
    render(
      <AnalyzeCard
        {...baseProps}
        provider="fixture_a"
        providers={[
          { label: "Fixture A", value: "fixture_a" },
          { label: "Fixture B", value: "fixture_b" },
        ]}
        onProviderChange={onProviderChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Backlink source" }));
    await user.click(screen.getByRole("menuitem", { name: "Fixture B" }));
    expect(onProviderChange).toHaveBeenCalledWith("fixture_b");
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
  });
  it("keeps the first control row at an exact 34px height", () => {
    render(<AnalyzeCard {...baseProps} />);

    expect(screen.getByPlaceholderText("Enter a domain or URL").parentElement).toHaveClass(
      "h-[34px]",
    );
    expect(screen.getByRole("button", { name: "Backlinks limit" })).toHaveClass(
      "h-[34px]",
      "min-h-0",
    );
    const scopeGroup = screen.getByRole("group", { name: "Backlinks target scope" });
    const wholeSite = screen.getByRole("radio", { name: "Whole site" });

    expect(scopeGroup).toHaveClass("shrink-0");
    expect(scopeGroup).not.toHaveClass("[&>div]:!h-[34px]", "[&>div]:!min-h-[34px]");
    expect(wholeSite.parentElement?.parentElement).toHaveClass(
      "min-h-[34px]",
      "bg-transparent",
      "text-[12.5px]",
    );
    expect(wholeSite.nextElementSibling).toHaveClass("h-[26px]", "min-w-[92px]");
    expect(wholeSite.nextElementSibling?.className).not.toContain("!");
  });

  it("uses shared compact typography for its target input", () => {
    render(<AnalyzeCard {...baseProps} />);

    expect(screen.getByRole("textbox", { name: "Backlinks target" })).toHaveClass(
      "h-full",
      "min-h-0",
      "py-1",
      "compact-text-12",
      "text-[12px]",
      "leading-4",
      "placeholder:text-[12px]",
      "placeholder:leading-4",
    );
  });

  it("keeps Analyze disabled until the estimate path validates a target, then shows price", () => {
    const { rerender } = render(<AnalyzeCard {...baseProps} />);
    expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();

    rerender(
      <AnalyzeCard
        {...baseProps}
        estimate={{
          cached: false,
          costCents: 5,
          loading: false,
          valid: true,
          payment: paymentQuote(),
        }}
        target="example.com"
      />,
    );

    expect(screen.getByRole("button", { name: "Analyze ≈ 4 tokens" })).toBeEnabled();
  });

  it("sizes a chosen domain as a quiet chip inside the 34px field", () => {
    render(<ScopeHarness />);
    const remove = screen.getByRole("button", { name: "Remove example.com" });
    expect(remove).toHaveClass("h-4", "w-4");
    expect(remove.parentElement).toHaveClass("h-[22px]", "gap-1", "px-[9px]", "text-xs");
    expect(remove.parentElement).not.toHaveClass("py-1");
    expect(remove.parentElement).not.toHaveClass("rounded-control");
    expect(remove.parentElement?.parentElement).toHaveClass("h-[34px]");
  });

  it("keeps the supplied quote unit while delegating scope changes", () => {
    render(<ScopeHarness />);

    const price = screen.getByRole("button", { name: "Analyze ≈ 4 tokens" });
    const exactPage = screen.getByRole("radio", { name: "Exact page" });
    fireEvent.click(exactPage);
    expect(exactPage).toBeChecked();
    expect(price).toHaveAccessibleName("Analyze ≈ 4 tokens");
  });

  it("flips the Include subdomains switch", () => {
    const onIncludeSubdomainsChange = vi.fn();
    render(<AnalyzeCard {...baseProps} onIncludeSubdomainsChange={onIncludeSubdomainsChange} />);

    fireEvent.click(screen.getByRole("switch", { name: "Include subdomains" }));
    expect(onIncludeSubdomainsChange).toHaveBeenCalledWith(false);
  });

  it("never turns a legacy scalar estimate into an action price", () => {
    render(
      <AnalyzeCard
        {...baseProps}
        target="example.com"
        estimate={{ cached: false, costCents: 999, loading: false, valid: true }}
      />,
    );
    expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled();
    expect(screen.queryByText(/9.99/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "How is this priced?" })).not.toBeInTheDocument();
  });
});
