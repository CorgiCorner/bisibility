import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe("ResearchSearchCard", () => {
  it("portals the market listbox outside the card and keeps options selectable", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            canonical_key: "DE",
            city_name: null,
            country_code: "DE",
            display_name: "Germany",
            id: "country:DE",
            kind: "country",
            region_name: null,
          },
        ],
      }),
    } as Response);

    const onLocationChange = vi.fn();
    render(<ResearchSearchCard {...baseProps} onLocationChange={onLocationChange} />);

    const marketInput = screen.getByRole("combobox", { name: "Market" });
    fireEvent.change(marketInput, { target: { value: "ger" } });

    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest(".MuiCard-root")).toBeNull();

    const germanyOption = await screen.findByText("Germany");
    fireEvent.click(germanyOption);
    expect(onLocationChange).toHaveBeenCalledWith(expect.objectContaining({ canonicalKey: "DE" }));
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

  it("wraps the compact desktop control row instead of overflowing the content column", () => {
    render(<ResearchSearchCard {...baseProps} />);

    const seedInput = screen.getByRole("textbox", { name: "Seed keyword" });
    const controlRow = seedInput.closest('[class*="md:flex-row"]');
    expect(controlRow).not.toBeNull();
    expect(controlRow?.className).toMatch(/md:flex-wrap/);
  });
});
