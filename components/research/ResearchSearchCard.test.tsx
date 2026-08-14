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
    hl: "en",
    kind: "country" as const,
    languageLabel: "English",
  },
  mode: "auto" as const,
  metricsScope: undefined,
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

  it("keeps the market language visible in the control", () => {
    render(<ResearchSearchCard {...baseProps} />);

    expect(screen.getByRole("combobox", { name: "Market" })).toHaveValue("United States / English");
  });

  it("disables provider work for an unsupported pair but keeps the market editable", () => {
    render(<ResearchSearchCard {...baseProps} lookupDisabled />);

    expect(screen.getByRole("button", { name: "Research ~$0.03" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Market" })).toBeEnabled();
  });

  it("hides the metrics scope when the country selection already matches it", () => {
    render(<ResearchSearchCard {...baseProps} />);

    expect(screen.queryByRole("status", { name: /Metrics scope:/ })).not.toBeInTheDocument();
  });

  it("renders the exact metrics scope for a city degraded to its country", () => {
    render(
      <ResearchSearchCard
        {...baseProps}
        metricsScope={{ country: "Spain", language: "Spanish" }}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Metrics scope: Spain - Spanish" }),
    ).toHaveTextContent("Metrics scope: Spain - Spanish");
  });

  it("shows the provider control even when only one connection is eligible", () => {
    render(<ResearchSearchCard {...baseProps} />);

    expect(screen.getByRole("button", { name: "Data provider connection" })).toHaveTextContent(
      "Provider:DataForSEO",
    );
  });

  it("links pricing guidance to the provider docs", () => {
    render(<ResearchSearchCard {...baseProps} />);

    expect(screen.getByRole("link", { name: "How is this priced?" })).toHaveAttribute(
      "href",
      "https://bisibility.com/docs/api/keyword-research#research-keywords",
    );
    expect(screen.queryByText("Estimated DataForSEO cost")).not.toBeInTheDocument();
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
