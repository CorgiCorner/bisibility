import { MarketCombobox, type MarketComboboxOption } from "@/components/markets/MarketCombobox";
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

describe("MarketCombobox", () => {
  it("groups tracked and catalog markets, showing tracked first", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={catalog}
        onChange={vi.fn()}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.getByText("Tracked markets")).toBeInTheDocument();
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument();
  });

  it("searches by country and language codes", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={catalog}
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
        catalogMarkets={catalog}
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
        catalogMarkets={catalog}
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

  it("shows disabled tooltip and secondary text on unavailable options", async () => {
    const user = userEvent.setup();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={catalog}
        onChange={vi.fn()}
        trackedMarkets={tracked}
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "poland");
    const item = screen.getByRole("menuitem", { name: /Poland \/ Polish/ });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "Outside catalog");
    expect(item).toHaveTextContent("unavailable");
  });

  it("does not invoke onChange when a disabled option is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarketCombobox
        ariaLabel="Market"
        catalogMarkets={catalog}
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
});
