import {
  MarketDefinition,
  type MarketDefinitionLocation,
  type MarketDefinitionProps,
  type MarketDefinitionValue,
} from "@/components/markets/blocks/MarketDefinition";
import { marketDefinitionSelection } from "@/components/markets/blocks/market-definition-selection";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const countries = [
  { code: "ES", label: "Spain" },
  { code: "BE", label: "Belgium" },
];

const languages: Record<string, { code: string; label: string }[]> = {
  BE: [
    { code: "nl", label: "Dutch" },
    { code: "fr", label: "French" },
  ],
  ES: [
    { code: "es", label: "Spanish" },
    { code: "ca", label: "Catalan" },
  ],
};

const malaga: MarketDefinitionLocation = {
  canonicalKey: "ES/Andalusia/Malaga",
  countryCode: "ES",
  displayName: "Malaga, Andalusia, Spain",
  kind: "city",
};
const andalusia: MarketDefinitionLocation = {
  canonicalKey: "ES/Andalusia",
  countryCode: "ES",
  displayName: "Andalusia, Spain",
  kind: "region",
};

function source(overrides: Partial<MarketDefinitionProps["source"]> = {}) {
  return {
    countries,
    languagesFor: (countryCode: string) => ({
      all: [...(languages[countryCode] ?? []), { code: "en", label: "English" }],
      suggested: languages[countryCode] ?? [],
    }),
    searchLocations: vi.fn(async (query: string, countryCode: string) =>
      countryCode === "ES" && /mal|anda/i.test(query) ? [andalusia, malaga] : [],
    ),
    ...overrides,
  };
}

function empty(overrides: Partial<MarketDefinitionValue> = {}): MarketDefinitionValue {
  return { countryCode: null, customName: "", languageCode: null, location: null, ...overrides };
}

function props(overrides: Partial<MarketDefinitionProps> = {}): MarketDefinitionProps {
  return {
    duplicate: null,
    onChange: vi.fn(),
    registry: [],
    source: source(),
    value: empty(),
    ...overrides,
  };
}

describe("MarketDefinition", () => {
  it("suggests distinct countries from existing markets and the current selection", async () => {
    const user = userEvent.setup();
    render(
      <MarketDefinition
        {...props({
          registry: [
            { canonicalKey: "ES/Andalusia/Malaga", id: "pmkt_1", status: "active" },
            { canonicalKey: "ES@en", id: "pmkt_2", status: "archived" },
          ],
          value: empty({ countryCode: "BE" }),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Country" }));
    expect(screen.getByText("Suggested")).toBeVisible();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Spain",
      "Belgium",
    ]);
  });

  it("starts with every creation choice empty and keeps dependent controls inert", () => {
    render(<MarketDefinition {...props()} />);

    expect(screen.getByRole("button", { name: "Country" })).toHaveTextContent("Country");
    expect(screen.getByRole("button", { name: "Location" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Language" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /devices/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/default devices/i)).not.toBeInTheDocument();
  });

  it("uses the selected country as the default location without assuming a language or custom name", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MarketDefinition {...props({ onChange })} />);

    await user.click(screen.getByRole("button", { name: "Country" }));
    expect(screen.getByRole("menuitem", { name: "Belgium" })).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: "Spain" }));

    expect(onChange).toHaveBeenCalledWith(
      empty({
        countryCode: "ES",
        location: {
          canonicalKey: "ES",
          countryCode: "ES",
          displayName: "Spain",
          kind: "country",
        },
      }),
    );
  });

  it("offers the country's suggested languages, with the rest of the catalog behind the search", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MarketDefinition {...props({ onChange, value: empty({ countryCode: "BE" }) })} />);

    await user.click(screen.getByRole("button", { name: "Language" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Dutch",
      "French",
    ]);
    await user.type(screen.getByRole("textbox", { name: "Search all languages" }), "eng");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["English"]);
    await user.clear(screen.getByRole("textbox", { name: "Search all languages" }));
    await user.click(screen.getByRole("menuitem", { name: "Dutch" }));

    expect(onChange).toHaveBeenCalledWith(empty({ countryCode: "BE", languageCode: "nl" }));
  });

  it("searches regions and cities through the source, scoped to the country, and labels each type", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const locationSource = source();
    render(
      <MarketDefinition
        {...props({
          onChange,
          source: locationSource,
          value: empty({ countryCode: "ES", languageCode: "es" }),
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Location" }));
    expect(screen.getByRole("menuitem", { name: "Spain (Country)" })).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Search regions and cities" }), "mal");

    await waitFor(() =>
      expect(locationSource.searchLocations).toHaveBeenCalledWith(
        "mal",
        "ES",
        expect.any(AbortSignal),
      ),
    );
    const city = await screen.findByRole("menuitem", { name: "Malaga, Andalusia, Spain (City)" });
    expect(screen.getByRole("menuitem", { name: "Andalusia, Spain (Region)" })).toBeVisible();
    await user.click(city);

    expect(onChange).toHaveBeenCalledWith(
      empty({ countryCode: "ES", languageCode: "es", location: malaga }),
    );
  });

  it("selects the country itself as a location without a search", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const locationSource = source();
    render(
      <MarketDefinition
        {...props({
          onChange,
          source: locationSource,
          value: empty({ countryCode: "ES", languageCode: "es" }),
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.click(screen.getByRole("menuitem", { name: "Spain (Country)" }));

    expect(locationSource.searchLocations).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      empty({
        countryCode: "ES",
        languageCode: "es",
        location: { canonicalKey: "ES", countryCode: "ES", displayName: "Spain", kind: "country" },
      }),
    );
  });

  it("resets the language and replaces a city with the whole new country and keeps the place on a language change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const complete = empty({ countryCode: "ES", languageCode: "es", location: malaga });
    const { rerender } = render(<MarketDefinition {...props({ onChange, value: complete })} />);

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("menuitem", { name: "Catalan" }));
    expect(onChange).toHaveBeenCalledWith({ ...complete, languageCode: "ca" });

    onChange.mockClear();
    rerender(<MarketDefinition {...props({ onChange, value: complete })} />);
    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "Belgium");
    await user.click(screen.getByRole("menuitem", { name: "Belgium" }));
    expect(onChange).toHaveBeenCalledWith(
      empty({
        countryCode: "BE",
        location: {
          canonicalKey: "BE",
          countryCode: "BE",
          displayName: "Belgium",
          kind: "country",
        },
      }),
    );
  });

  it("remounts the location picker when the country changes so no stale search survives", async () => {
    const user = userEvent.setup();
    const locationSource = source();
    const { rerender } = render(
      <MarketDefinition
        {...props({
          source: locationSource,
          value: empty({ countryCode: "ES", languageCode: "es" }),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.type(screen.getByRole("textbox", { name: "Search regions and cities" }), "mal");
    await screen.findByRole("menuitem", { name: "Malaga, Andalusia, Spain (City)" });
    await user.keyboard("{Escape}");

    rerender(
      <MarketDefinition
        {...props({
          source: locationSource,
          value: empty({ countryCode: "BE", languageCode: "nl" }),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Location" }));

    expect(screen.queryByRole("menuitem", { name: /Malaga/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Belgium (Country)" })).toBeVisible();
  });

  it("derives the language-qualified selection key from the place and the language", () => {
    expect(marketDefinitionSelection(empty({ countryCode: "ES", languageCode: "es" }))).toBeNull();
    expect(
      marketDefinitionSelection(empty({ countryCode: "ES", languageCode: "es", location: malaga })),
    ).toEqual({
      canonicalKey: "ES/Andalusia/Malaga",
      countryCode: "ES",
      kind: "city",
      languageCode: "es",
    });
    expect(
      marketDefinitionSelection(empty({ countryCode: "ES", languageCode: "en", location: malaga })),
    ).toEqual({
      canonicalKey: "ES/Andalusia/Malaga@en",
      countryCode: "ES",
      kind: "city",
      languageCode: "en",
    });
  });

  it("reports an active or archived duplicate from the registry by selection key without a lifecycle mutation", () => {
    const value = empty({ countryCode: "ES", languageCode: "en", location: malaga });
    const { rerender } = render(
      <MarketDefinition
        {...props({
          registry: [{ canonicalKey: "ES/Andalusia/Malaga@en", id: "pmkt_1", status: "active" }],
          value,
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("already active");
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();

    rerender(
      <MarketDefinition
        {...props({
          registry: [{ canonicalKey: "ES/Andalusia/Malaga", id: "pmkt_1", status: "archived" }],
          value,
        })}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(
      <MarketDefinition
        {...props({ duplicate: { label: "Spain / Spanish", state: "archived" }, value })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Restore it from Markets");
  });
});
