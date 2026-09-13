import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResearchSearchCard } from "./ResearchSearchCard";

const baseProps = {
  connectionId: "conn_a00000000000000000000000",
  connectionOptions: [{ label: "DataForSEO", value: "conn_a00000000000000000000000" }],
  estimate: { cached: false, costCents: 3, loading: false },
  includeClickstream: false,
  scope: {
    countryCode: "US",
    countryName: "United States",
    languageCode: "en",
    languageLabel: "English",
    providerLocationCode: 2840,
    researchAvailable: true,
  },
  scopes: [],
  mode: "auto" as const,
  onConnectionChange: vi.fn(),
  onIncludeClickstreamChange: vi.fn(),
  onLimitChange: vi.fn(),
  onScopeChange: vi.fn(),
  onModeChange: vi.fn(),
  onSeedsChange: vi.fn(),
  onSubmit: vi.fn(),
  researching: false,
  resultLimit: 100 as const,
  seeds: [] as string[],
};

describe("ResearchSearchCard", () => {
  it("allows country selection when lookup is blocked but locks it during research", async () => {
    const user = userEvent.setup();
    const onScopeChange = vi.fn();
    const { rerender } = render(
      <ResearchSearchCard
        {...baseProps}
        disabled
        lookupDisabled
        onScopeChange={onScopeChange}
        seeds={["seo"]}
      />,
    );
    const country = screen.getByRole("button", { name: "Country" });
    expect(country).toBeEnabled();
    await user.click(country);
    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "germany");
    await user.click(screen.getByRole("menuitem", { name: "Germany" }));
    expect(onScopeChange).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "DE" }));
    expect(screen.getByRole("button", { name: "Research ~$0.03" })).toBeDisabled();
    rerender(<ResearchSearchCard {...baseProps} researching />);
    expect(screen.getByRole("button", { name: "Country" })).toBeDisabled();
  });

  it("fills the full-width tooltip wrapper", () => {
    const { container } = render(<ResearchSearchCard {...baseProps} />);

    expect(container.querySelector("[data-slot='card']")).toHaveClass("w-full");
  });

  it("portals the country menu outside the card and keeps options selectable", async () => {
    const user = userEvent.setup();
    const onScopeChange = vi.fn();
    render(<ResearchSearchCard {...baseProps} onScopeChange={onScopeChange} />);

    await user.click(screen.getByRole("button", { name: "Country" }));
    const menu = await screen.findByRole("menu", { name: "Country" });
    expect(menu.closest("[data-slot='card']")).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "germany");
    await user.click(screen.getByRole("menuitem", { name: "Germany" }));
    expect(onScopeChange).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "DE" }));
  });

  it("renders the action estimate and its cached-free state", () => {
    const { rerender } = render(<ResearchSearchCard {...baseProps} />);
    expect(screen.getByRole("button", { name: "Research ~$0.03" })).toBeInTheDocument();

    rerender(
      <ResearchSearchCard
        {...baseProps}
        estimate={{ cached: true, costCents: 0, loading: false }}
      />,
    );
    expect(screen.getByRole("button", { name: "Research free, cached" })).toBeInTheDocument();
  });

  it("names the country without its language in the compact research control", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const scope = screen.getByRole("button", { name: "Country" });
    expect(scope).toHaveTextContent("United States");
    expect(scope).not.toHaveTextContent("English");
    expect(scope.querySelector("[data-country-flag='US']")).toBeInTheDocument();
    expect(scope).toHaveClass("min-h-[34px]", "text-[13px]", "bg-bg-elev");
    expect(scope).not.toHaveClass("h-10", "min-h-10", "text-[12px]");
  });

  it("disables provider work for an unsupported pair but keeps the scope editable", () => {
    render(<ResearchSearchCard {...baseProps} lookupDisabled />);

    expect(screen.getByRole("button", { name: "Research ~$0.03" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Country" })).toBeEnabled();
  });

  it("hides the provider control while only one provider supports research", () => {
    render(<ResearchSearchCard {...baseProps} />);

    expect(screen.queryByRole("button", { name: "Data provider connection" })).toBeNull();
  });

  it("pins the compact mode caret after its left content cluster", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Research mode" });
    expect(trigger).toHaveClass("text-[12px]", "leading-4");
    expect(trigger.querySelector("[data-menu-select-content]")).toHaveClass("min-w-0");
    expect(trigger.querySelector("[data-menu-select-caret]")).toHaveClass("ml-auto");
    expect(screen.getByRole("button", { name: "Results limit" })).toHaveClass("justify-between");
  });

  it("keeps the embedded seed wrapper at compact control height", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const seed = screen.getByRole("textbox", { name: "Seed keyword" });
    expect(seed.parentElement).toHaveClass("min-h-[34px]", "py-0.5");
    expect(seed).toHaveClass(
      "compact-text-12",
      "text-[12px]",
      "leading-4",
      "placeholder:text-[12px]",
      "placeholder:leading-4",
    );
    expect(seed).not.toHaveClass("min-h-[34px]", "py-1");
  });

  it("matches the Domain Overview pricing action layout", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const pricing = screen.getByRole("button", { name: "How is this priced?" });
    const actions = pricing.parentElement;
    const submitWrapper = screen.getByRole("button", { name: "Research ~$0.03" }).parentElement;

    expect(actions).toHaveClass("ml-auto", "flex", "items-center", "gap-4");
    expect(actions).not.toHaveClass(
      "w-full",
      "flex-col",
      "flex-wrap",
      "flex-row",
      "justify-between",
    );
    expect(
      pricing.compareDocumentPosition(submitWrapper as HTMLSpanElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(pricing).not.toHaveClass("min-w-0", "shrink", "text-left", "order-2", "self-end");
    expect(submitWrapper).not.toHaveClass("shrink-0", "order-1", "self-end");
  });

  it("opens a pricing popover with source rows and an in-popover docs link", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "How is this priced?" });
    fireEvent.click(trigger);

    expect(screen.queryByRole("link", { name: "How is this priced?" })).toBeNull();

    expect(screen.getByText("Related keywords")).toBeInTheDocument();
    expect(screen.getByText("Keyword suggestions")).toBeInTheDocument();
    expect(screen.getByText("Keyword ideas")).toBeInTheDocument();
    expect(screen.getByText("Repeat within 12 hours")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Read the pricing docs" })).toHaveAttribute(
      "href",
      "https://bisibility.com/docs/api/keyword-research#research-keywords",
    );
  });

  it("disables the submit button and shows a hover-reachable hint when no seed is committed or typed", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const button = screen.getByRole("button", { name: "Research ~$0.03" });
    expect(button).toBeDisabled();

    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();

    const wrapper = button.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("title", "Enter a seed keyword first - the price appears here");
    expect(getComputedStyle(wrapper as HTMLElement).pointerEvents).not.toBe("none");

    const description = describedBy ? document.getElementById(describedBy) : null;
    expect(description).not.toBeNull();
    expect(description).toHaveClass("sr-only");
    expect(description).toHaveTextContent("Enter a seed keyword first - the price appears here");
  });

  it("enables the submit button as soon as a non-whitespace seed character is typed", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const input = screen.getByRole("textbox", { name: "Seed keyword" });
    fireEvent.change(input, { target: { value: "x" } });

    const button = screen.getByRole("button", { name: "Research ~$0.03" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("title");
    expect(button).not.toHaveAttribute("aria-describedby");
    expect(button.parentElement).not.toHaveAttribute("title");
  });

  it("keeps the submit button disabled for the budget prop even with a committed seed", () => {
    render(<ResearchSearchCard {...baseProps} disabled seeds={["seo"]} />);

    expect(screen.getByRole("button", { name: "Research ~$0.03" })).toBeDisabled();
  });

  it("keeps the submit button disabled when lookup is blocked even with a typed seed", () => {
    render(<ResearchSearchCard {...baseProps} lookupDisabled />);

    const input = screen.getByRole("textbox", { name: "Seed keyword" });
    fireEvent.change(input, { target: { value: "seo" } });

    expect(screen.getByRole("button", { name: "Research ~$0.03" })).toBeDisabled();
  });

  it("creates seed chips before submit and clears the pending seed list", async () => {
    const onSeedsChange = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ResearchSearchCard {...baseProps} onSeedsChange={onSeedsChange} onSubmit={onSubmit} />,
    );
    const input = screen.getByRole("textbox", { name: "Seed keyword" });
    fireEvent.change(input, { target: { value: "rank tracker" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSeedsChange).toHaveBeenCalledWith(["rank tracker"]);

    rerender(
      <ResearchSearchCard
        {...baseProps}
        onSeedsChange={onSeedsChange}
        onSubmit={onSubmit}
        seeds={["rank tracker"]}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Seed keyword" }), {
      target: { value: "seo tool" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Research ~$0.03" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(["rank tracker", "seo tool"]));
    expect(onSeedsChange).toHaveBeenLastCalledWith([]);
  });

  it("uses compact tokenizer tokens rather than full pill seed chips", () => {
    render(<ResearchSearchCard {...baseProps} seeds={["rank tracker"]} />);

    const token = screen.getByText("rank tracker").parentElement;
    const dismiss = screen.getByRole("button", { name: "Remove rank tracker" });
    expect(token).toHaveClass("h-[26px]", "rounded-control", "bg-bg-elev", "border-border");
    expect(token).not.toHaveClass("rounded-full");
    expect(dismiss).toHaveAttribute("type", "button");
    expect(dismiss).toHaveClass("size-4", "items-center", "justify-center", "rounded-[4px]");
    expect(dismiss).not.toHaveClass("rounded-full");
    expect(dismiss.querySelector("svg")).toHaveAttribute("width", "14");
  });

  it("wraps the compact desktop control row instead of overflowing the content column", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const seedInput = screen.getByRole("textbox", { name: "Seed keyword" });
    const controlRow = seedInput.closest('[class*="md:flex-row"]');
    expect(controlRow).not.toBeNull();
    expect(controlRow?.className).toMatch(/md:flex-wrap/);
  });
});
