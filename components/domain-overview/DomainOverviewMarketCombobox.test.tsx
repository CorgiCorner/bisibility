import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DomainOverviewMarketCombobox } from "./DomainOverviewMarketCombobox";

const spain = {
  canonicalKey: "ES",
  cityName: null,
  countryCode: "ES",
  displayName: "Spain",
  kind: "country" as const,
  languageCode: "es",
  languageLabel: "Spanish",
  locationCode: 2724,
  provenance: "Malaga tracked at city level - domain analysis runs on the country pair.",
  regionName: null,
  researchAvailable: true,
};
const unavailable = {
  ...spain,
  canonicalKey: "ES@en",
  languageCode: "en",
  languageLabel: "English",
  provenance: null,
  researchAvailable: false,
};
const unitedStates = {
  ...spain,
  canonicalKey: "US",
  countryCode: "US",
  displayName: "United States",
  languageCode: "en",
  languageLabel: "English",
  locationCode: 2840,
  provenance: null,
};

describe("DomainOverviewMarketCombobox", () => {
  it("shows tracked markets first and reveals the filtered catalog in the same combobox", () => {
    render(
      <DomainOverviewMarketCombobox
        catalogMarkets={[unitedStates]}
        onChange={vi.fn()}
        trackedMarkets={[spain, unavailable]}
        value={spain}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /market: spain \/ spanish/i }));
    const combobox = screen.getByRole("combobox", { name: "Search markets" });
    expect(screen.getByRole("group", { name: "Tracked markets" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Catalog" })).not.toBeInTheDocument();

    fireEvent.change(combobox, { target: { value: "United" } });
    expect(screen.queryByRole("group", { name: "Tracked markets" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Catalog" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /united states.*english/i })).toBeInTheDocument();
  });

  it("keeps off-catalog tracked pairs disabled with an accessible reason", () => {
    const onChange = vi.fn();
    render(
      <DomainOverviewMarketCombobox
        catalogMarkets={[unitedStates]}
        onChange={onChange}
        trackedMarkets={[spain, unavailable]}
        value={spain}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /market:/i }));
    const option = screen.getByRole("option", { name: /spain.*english/i });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("unavailable");
    const reasonId = option.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(within(option).getByText(/outside the research catalog/i)).toHaveClass("sr-only");
    fireEvent.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("selects a catalog result from the keyboard", () => {
    const onChange = vi.fn();
    render(
      <DomainOverviewMarketCombobox
        catalogMarkets={[unitedStates]}
        onChange={onChange}
        trackedMarkets={[spain]}
        value={spain}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /market:/i }));
    const combobox = screen.getByRole("combobox", { name: "Search markets" });
    fireEvent.change(combobox, { target: { value: "United" } });
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(unitedStates);
  });

  it("instructs an empty project to search before showing a no-match message", () => {
    render(
      <DomainOverviewMarketCombobox
        catalogMarkets={[]}
        onChange={vi.fn()}
        trackedMarkets={[]}
        value={spain}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /market:/i }));
    expect(screen.getByText("Type to search the catalog.")).toBeVisible();
    expect(screen.queryByText("No market matches this search.")).not.toBeInTheDocument();
  });
});
