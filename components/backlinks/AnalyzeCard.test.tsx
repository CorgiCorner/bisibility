import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      estimate={{ cached: false, costCents: 5, loading: false, valid: true }}
      onScopeChange={setScope}
      scope={scope}
      target="example.com"
    />
  );
}

describe("AnalyzeCard", () => {
  it("keeps the domain field the same 38px height as the adjacent selects", () => {
    render(<AnalyzeCard {...baseProps} />);

    expect(screen.getByPlaceholderText("Enter a domain or URL").parentElement).toHaveClass(
      "h-[38px]",
    );
    expect(screen.getByRole("button", { name: "Backlinks limit" })).toHaveClass("min-h-[38px]");
    expect(screen.getByRole("group", { name: "Backlinks target scope" })).toHaveClass(
      "[&>div]:!min-h-[38px]",
    );
    expect(screen.getByRole("radio", { name: "Whole site" }).nextElementSibling).toHaveClass(
      "!min-h-[30px]",
    );
  });

  it("keeps Analyze disabled until the estimate path validates a target, then shows price", () => {
    const { rerender } = render(<AnalyzeCard {...baseProps} />);
    expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();

    rerender(
      <AnalyzeCard
        {...baseProps}
        estimate={{ cached: false, costCents: 5, loading: false, valid: true }}
        target="example.com"
      />,
    );

    expect(screen.getByRole("button", { name: "Analyze ~$0.05" })).toBeEnabled();
  });

  it("opens pricing and dismisses it with Escape and click-outside", async () => {
    render(<AnalyzeCard {...baseProps} />);
    const trigger = screen.getByRole("button", { name: "How is this priced?" });

    fireEvent.click(trigger);
    expect(screen.getByText("Provider cost")).toBeInTheDocument();
    const popoverRoot = document.querySelector(".MuiPopover-root");
    expect(popoverRoot).not.toBeNull();
    fireEvent.keyDown(popoverRoot as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Provider cost")).not.toBeInTheDocument());

    fireEvent.click(trigger);
    const backdrop = document.querySelector(".MuiBackdrop-root");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    await waitFor(() => expect(screen.queryByText("Provider cost")).not.toBeInTheDocument());
  });

  it("switches scope without changing the displayed estimate", () => {
    render(<ScopeHarness />);

    const price = screen.getByRole("button", { name: "Analyze ~$0.05" });
    const exactPage = screen.getByRole("radio", { name: "Exact page" });
    fireEvent.click(exactPage);
    expect(exactPage).toBeChecked();
    expect(price).toHaveAccessibleName("Analyze ~$0.05");
  });

  it("flips the Include subdomains switch", () => {
    const onIncludeSubdomainsChange = vi.fn();
    render(<AnalyzeCard {...baseProps} onIncludeSubdomainsChange={onIncludeSubdomainsChange} />);

    fireEvent.click(screen.getByRole("switch", { name: "Include subdomains" }));
    expect(onIncludeSubdomainsChange).toHaveBeenCalledWith(false);
  });

  it("omits the history row for page scope", () => {
    const { unmount } = render(<AnalyzeCard {...baseProps} scope="page" />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));
    expect(screen.queryByText("12-month history")).not.toBeInTheDocument();
    unmount();

    render(<AnalyzeCard {...baseProps} scope="site" />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));
    expect(screen.getByText("12-month history")).toBeInTheDocument();
  });

  it("prices every billed row from the rate card so the rows reconcile with the button", () => {
    // Server side, backlinksEstimate bills summary + history (site only) +
    // rows(resultLimit). At site scope and 100 rows that is 2 + 2 + 1 = 5 cents,
    // which is exactly the "Analyze ~$0.05" label the estimate harness asserts.
    render(<AnalyzeCard {...baseProps} resultLimit={100} scope="site" />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));

    expect(screen.getByText("Profile summary, new & lost").nextElementSibling).toHaveTextContent(
      "$0.02",
    );
    expect(screen.getByText("12-month history").nextElementSibling).toHaveTextContent("$0.02");
    expect(screen.getByText("Link rows (100)").nextElementSibling).toHaveTextContent("$0.01");
  });

  it("scales the link rows price with resultLimit", () => {
    const { unmount } = render(<AnalyzeCard {...baseProps} resultLimit={100} scope="site" />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));
    expect(screen.getByText("Link rows (100)")).toBeInTheDocument();
    expect(screen.getByText("$0.01")).toBeInTheDocument();
    unmount();

    render(<AnalyzeCard {...baseProps} resultLimit={500} scope="site" />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));
    expect(screen.getByText("Link rows (500)")).toBeInTheDocument();
    expect(screen.getByText("$0.05")).toBeInTheDocument();
  });
});
