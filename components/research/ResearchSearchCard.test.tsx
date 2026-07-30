import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResearchSearchCard } from "./ResearchSearchCard";

const baseProps = {
  connectionId: "conn_a00000000000000000000000",
  connectionOptions: [{ label: "DataForSEO", value: "conn_a00000000000000000000000" }],
  estimate: { cached: false, costCents: 3, loading: false },
  includeClickstream: false,
  location: {
    canonicalKey: "US",
    countryCode: "US",
    displayName: "United States",
    kind: "country" as const,
  },
  mode: "auto" as const,
  onConnectionChange: vi.fn(),
  onIncludeClickstreamChange: vi.fn(),
  onLimitChange: vi.fn(),
  onLocationChange: vi.fn(),
  onModeChange: vi.fn(),
  onSeedsChange: vi.fn(),
  onSubmit: vi.fn(),
  projectId: "prj_1",
  researching: false,
  resultLimit: 100 as const,
  seeds: [] as string[],
};

describe("ResearchSearchCard", () => {
  it("lets market search results overlay content below the card", () => {
    render(<ResearchSearchCard {...baseProps} />);

    expect(screen.getByRole("combobox", { name: "Market" }).closest(".MuiCard-root")).toHaveClass(
      "overflow-visible",
    );
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

  it("uses a quiet pricing trigger and a clearly bounded popover", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "How is this priced?" });
    expect(trigger).not.toHaveClass("font-semibold", "underline");
    fireEvent.click(trigger);

    const popover = screen.getByText("Estimated DataForSEO cost").closest(".MuiPopover-paper");
    expect(popover).toHaveClass("rounded-[12px]", "border", "border-border-strong");
    expect(popover).toHaveStyle({ overflow: "hidden" });
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
});
