import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      estimate={{ cached: false, costCents: 5, loading: false, valid: true }}
      onScopeChange={setScope}
      scope={scope}
      target="example.com"
    />
  );
}

describe("AnalyzeCard", () => {
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
        estimate={{ cached: false, costCents: 5, loading: false, valid: true }}
        target="example.com"
      />,
    );

    expect(screen.getByRole("button", { name: "Analyze ~$0.05" })).toBeEnabled();
  });

  it("keeps pricing before the primary action in the shared action wrapper", () => {
    render(<AnalyzeCard {...baseProps} />);

    const pricing = screen.getByRole("button", { name: "How is this priced?" });
    const actions = pricing.parentElement;
    const submit = screen.getByRole("button", { name: "Analyze" });

    expect(actions).toHaveClass("ml-auto", "flex", "items-center", "gap-4");
    expect(actions).not.toHaveClass(
      "w-full",
      "flex-col",
      "flex-wrap",
      "flex-row",
      "justify-between",
    );
    expect(pricing.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pricing).not.toHaveClass("min-w-0", "shrink", "text-left", "order-2", "self-end");
    expect(submit).not.toHaveClass("shrink-0", "order-1", "self-end");
  });

  it("opens pricing and dismisses it with Escape and click-outside", async () => {
    render(<AnalyzeCard {...baseProps} />);
    const trigger = screen.getByRole("button", { name: "How is this priced?" });

    await userEvent.click(trigger);
    expect(screen.getByText("Provider cost")).toBeInTheDocument();
    const popoverRoot = document.querySelector("[data-ui-overlay]");
    expect(popoverRoot).not.toBeNull();
    fireEvent.keyDown(popoverRoot as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Provider cost")).not.toBeInTheDocument());

    await userEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
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

    expect(screen.getByText("Profile summary, new and lost").nextElementSibling).toHaveTextContent(
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
