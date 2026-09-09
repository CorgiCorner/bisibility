import { MarketCombobox, type MarketComboboxOption } from "@/components/markets/MarketCombobox";
import { MARKET_PICKER_SEARCH_THRESHOLD } from "@/components/markets/market-picker-constants";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

type Payload = { id: string; label: string };

function market(
  value: string,
  locationLabel: string,
  countryCode: string,
  languageLabel: string,
  languageCode: string,
  payload: Payload,
  overrides: Partial<MarketComboboxOption<Payload>> = {},
): MarketComboboxOption<Payload> {
  return {
    countryCode,
    languageCode,
    languageLabel,
    locationLabel,
    payload,
    value,
    ...overrides,
  };
}

const tracked = [
  market("US", "United States", "US", "English", "en", { id: "us", label: "US market" }),
  market("ES", "Spain", "ES", "Spanish", "es", { id: "es", label: "ES market" }),
];

const catalog = [
  market("US", "United States", "US", "English", "en", { id: "us-cat", label: "US catalog" }),
  market("GB", "United Kingdom", "GB", "English", "en", { id: "gb", label: "GB catalog" }),
  market(
    "PL",
    "Poland",
    "PL",
    "Polish",
    "pl",
    { id: "pl", label: "PL catalog" },
    { disabled: true, secondary: "unavailable", tooltip: "Outside catalog" },
  ),
];

const largeCatalog = [
  ...catalog,
  market("FR", "France", "FR", "French", "fr", { id: "fr", label: "FR catalog" }),
  market("DE", "Germany", "DE", "German", "de", { id: "de", label: "DE catalog" }),
  market("IT", "Italy", "IT", "Italian", "it", { id: "it", label: "IT catalog" }),
];

describe("MarketCombobox", () => {
  it("groups tracked and catalog markets, showing tracked first", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={largeCatalog}
        onChange={vi.fn()}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.getByText("Tracked markets")).toBeInTheDocument();
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument();
  });

  it("preserves an explicit menu width override", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={largeCatalog}
        menuWidth={312}
        onChange={vi.fn()}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(document.querySelector<HTMLElement>("[data-ui-overlay]")).toHaveStyle({
      maxWidth: "calc(100vw - 32px)",
      minWidth: "min(312px, calc(100vw - 32px))",
      width: "312px",
    });
  });

  it("uses the selected country flag for the trigger and menu options", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={largeCatalog}
        onChange={vi.fn()}
        selectedCountryCode="US"
        trackedMarkets={tracked}
        value="US"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Market" });
    expect(trigger.querySelector("[data-country-flag='US']")).toBeInTheDocument();
    await user.click(trigger);
    expect(
      screen
        .getByRole("menuitem", { name: /United States \/ English/ })
        .querySelector("[data-country-flag='US']"),
    ).toBeInTheDocument();
  });

  it("searches by country and language codes", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={largeCatalog}
        onChange={vi.fn()}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "pl");
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Poland \/ Polish/ })).toBeInTheDocument();
    expect(screen.queryByText("Tracked markets")).not.toBeInTheDocument();
  });

  it("de-duplicates catalog values already present in tracked options", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={largeCatalog}
        onChange={vi.fn()}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "united");
    const usItems = screen.getAllByRole("menuitem", { name: /United States \/ English/ });
    expect(usItems).toHaveLength(1);
  });

  it("maps the selected value back to the caller payload", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={largeCatalog}
        onChange={onChange}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "kingdom");
    await user.click(screen.getByRole("menuitem", { name: /United Kingdom \/ English/ }));
    expect(onChange).toHaveBeenCalledWith({ id: "gb", label: "GB catalog" });
  });

  it("omits the separator when a legacy market has no language label", () => {
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={[]}
        onChange={vi.fn()}
        trackedMarkets={[
          market("ES@ca", "Spain", "ES", "", "ca", { id: "es-ca", label: "Legacy market" }),
        ]}
        value="ES@ca"
      />,
    );

    expect(screen.getByRole("button", { name: "Market" })).toHaveTextContent("Spain");
    expect(screen.getByRole("button", { name: "Market" })).not.toHaveTextContent("Spain /");
  });

  it("shows disabled reason via aria-describedby and secondary text on unavailable options", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={largeCatalog}
        onChange={vi.fn()}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "poland");
    const item = screen.getByRole("menuitem", { name: /Poland \/ Polish/ });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toHaveAttribute("title");
    const describedBy = item.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const desc = document.getElementById(describedBy ?? "");
    expect(desc).toHaveTextContent("Outside catalog");
    expect(item).toHaveTextContent("unavailable");
  });

  it("does not invoke onChange when a disabled option is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={largeCatalog}
        onChange={onChange}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "poland");
    fireEvent.click(screen.getByRole("menuitem", { name: /Poland \/ Polish/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a selected checkmark on the current value", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={catalog}
        onChange={vi.fn()}
        trackedMarkets={tracked}
        value="ES"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    const esItem = screen.getByRole("menuitem", { name: /Spain \/ Spanish/ });
    expect(esItem).not.toHaveAttribute("aria-disabled", "true");
    expect(esItem).toHaveAttribute("data-current", "true");
  });

  it("shows search only above the shared registry threshold", async () => {
    const user = userEvent.setup();
    const six = Array.from({ length: MARKET_PICKER_SEARCH_THRESHOLD }, (_, index) =>
      market(`M${index}`, `Market ${index}`, "ES", "Spanish", "es", {
        id: `market-${index}`,
        label: `Market ${index}`,
      }),
    );
    const { unmount } = render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={[]}
        onChange={vi.fn()}
        trackedMarkets={six}
        value="M0"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.queryByRole("textbox", { name: "Search markets..." })).not.toBeInTheDocument();
    expect(screen.queryByText("Tracked markets")).not.toBeInTheDocument();

    unmount();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={[]}
        onChange={vi.fn()}
        trackedMarkets={[
          ...six,
          market("M6", "Market 6", "ES", "Spanish", "es", { id: "market-6", label: "Market 6" }),
        ]}
        value="M0"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.getByRole("textbox", { name: "Search markets..." })).toBeVisible();
  });

  it("keeps a catalog-only menu search-only above the shared registry threshold", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={[
          ...largeCatalog,
          market("SE", "Sweden", "SE", "Swedish", "sv", { id: "se", label: "SE catalog" }),
        ]}
        onChange={vi.fn()}
        trackedMarkets={[]}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.getByRole("textbox", { name: "Search markets..." })).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: /United States \/ English/ }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "sweden");
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Sweden \/ Swedish/ })).toBeInTheDocument();
  });
});
