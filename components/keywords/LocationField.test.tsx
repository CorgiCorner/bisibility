import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { countryValueForName } from "@/components/keywords/location-picker-data";
import { sharedMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import { locationSearchWireCandidate } from "@/lib/test/fixtures/location";
import sharedMessages from "@/messages/core/en/shared.json";
import {
  render as baseRender,
  fireEvent,
  type RenderResult,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const locationMessages = {
  city: sharedMessages.shared.markets.locationCity,
  clearSearch: sharedMessages.shared.markets.locationClearSearch,
  countries: sharedMessages.shared.markets.locationCountries,
  noMatching: sharedMessages.shared.markets.locationNoMatching,
  region: sharedMessages.shared.markets.locationRegion,
  regionsAndCities: sharedMessages.shared.markets.locationRegionsAndCities,
  searching: sharedMessages.shared.markets.locationSearching,
};

// The field reads the viewer locale to name a stored country, so every render supplies the
// same shared-message boundary the app gives it.
function render(ui: ReactElement): RenderResult {
  const result = baseRender(sharedMessagesElement(ui));
  return {
    ...result,
    rerender: (next: ReactNode) => result.rerender(sharedMessagesElement(next)),
  };
}

function country(name = "United States") {
  const value = countryValueForName(name);
  if (!value) {
    throw new Error(`Missing test country: ${name}`);
  }
  return value;
}

function mockLocations(items: unknown[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: items }),
  } as Response);
}

afterEach(() => {
  fetchMock.mockReset();
});

function Harness({ initial = country() }: { initial?: LocationFieldValue }) {
  const [value, setValue] = useState<LocationFieldValue>(initial);
  return (
    <div>
      <LocationField
        messages={locationMessages}
        onChange={setValue}
        projectId="prj_1"
        value={value}
      />
      <output data-testid="kind">{value.kind}</output>
      <output data-testid="display">{value.displayName}</output>
      <output data-testid="key">{value.canonicalKey}</output>
    </div>
  );
}

describe("LocationField", () => {
  it("uses feature-owned location copy instead of the legacy English defaults", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "FR",
        country_code: "FR",
        display_name: "France",
        id: "country:FR",
      }),
    ]);

    render(
      <LocationField
        label="Ubicación"
        messages={{
          city: "Ciudad",
          clearSearch: "Borrar búsqueda de ubicación",
          countries: "Países",
          noMatching: "No hay ubicaciones coincidentes.",
          region: "Región",
          regionsAndCities: "Regiones y ciudades",
          searching: "Buscando ubicaciones...",
        }}
        onChange={vi.fn()}
        placeholder="Busca un país, región o ciudad"
        projectId="prj_1"
        value={country()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Ubicación" });
    expect(input).toHaveAttribute("placeholder", "Busca un país, región o ciudad");
    fireEvent.change(input, { target: { value: "fra" } });

    expect(await screen.findByText("Países")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Borrar búsqueda de ubicación" }),
    ).toBeInTheDocument();
  });

  it("keeps form and toolbar fields transparent with a visible border", () => {
    const { rerender } = render(
      <LocationField messages={locationMessages} onChange={vi.fn()} value={country()} />,
    );
    expect(screen.getByRole("combobox", { name: /location/i })).toHaveClass(
      "bg-transparent",
      "border-border-control",
    );
    rerender(
      <LocationField
        messages={locationMessages}
        onChange={vi.fn()}
        value={country()}
        variant="toolbar"
      />,
    );
    expect(screen.getByRole("combobox", { name: /location/i })).toHaveClass(
      "bg-transparent",
      "border-border-control",
    );
  });

  it("renders the research variant as a compact market control with a right caret", () => {
    render(
      <LocationField
        messages={locationMessages}
        onChange={vi.fn()}
        value={country()}
        variant="research"
      />,
    );

    const input = screen.getByRole("combobox", { name: /location/i });
    expect(input).toHaveClass(
      "min-h-[34px]",
      "w-full",
      "bg-bg-elev",
      "px-9",
      "py-1",
      "compact-text-13",
      "text-[13px]",
      "font-normal",
      "tracking-normal",
    );
    expect(input).not.toHaveClass("h-10", "min-h-10", "font-medium");
    expect(screen.getByTestId("location-field-caret")).toHaveClass("right-3");
    expect(input.parentElement?.querySelector("[data-country-flag='US']")).toBeInTheDocument();
  });

  it("queries mixed suggestions and preserves the selected city key", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "AU",
        country_code: "AU",
        display_name: "Australia",
        id: "country:AU",
      }),
      locationSearchWireCandidate({
        canonical_key: "US/Texas/Austin",
        city_name: "Austin",
        country_code: "US",
        display_name: "Austin, Texas, United States",
        id: "location:US/Texas/Austin",
        kind: "city",
        region_code: "US-TX",
        region_name: "Texas",
      }),
    ]);

    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /location/i }), {
      target: { value: "aus" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/locations/search?");
    expect(url).toContain("q=aus");
    expect(url).toContain("project=prj_1");
    expect(await screen.findByText("Countries")).toBeInTheDocument();
    expect(await screen.findByText("Regions and cities")).toBeInTheDocument();
    const countryOption = screen.getByRole("option", { name: "Australia" });
    const cityOption = screen.getByRole("option", { name: /Austin/ });
    expect(countryOption.querySelector("[data-country-flag='AU']")).toBeInTheDocument();
    expect(cityOption.querySelector("[data-city-location-pin]")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Austin"));
    expect(screen.getByTestId("kind")).toHaveTextContent("city");
    expect(screen.getByTestId("display")).toHaveTextContent("Austin, Texas, United States");
    expect(screen.getByTestId("key")).toHaveTextContent("US/Texas/Austin");
  });

  it("includes regions in keyboard selection and retains their type and key", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "ES/Andalusia@en",
        city_name: null,
        country_code: "ES",
        display_name: "Andalusia, Spain",
        id: "location:region:ES/Andalusia@en",
        kind: "region",
        region_name: "Andalusia",
      }),
    ]);
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.change(input, { target: { value: "anda" } });
    const option = await screen.findByRole("option", { name: /Andalusia, Spain.*Region/ });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("kind")).toHaveTextContent("region");
    expect(screen.getByTestId("key")).toHaveTextContent("ES/Andalusia@en");
  });

  it("supports keyboard selection", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "DE",
        country_code: "DE",
        display_name: "Germany",
        id: "country:DE",
      }),
    ]);

    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.change(input, { target: { value: "ger" } });
    await screen.findByText("Germany");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("display")).toHaveTextContent("Germany");
    expect(screen.getByTestId("key")).toHaveTextContent("DE");
  });

  it("renders and selects a country from a legacy response without id", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "ES",
        country_code: "ES",
        display_name: "Spain",
        hl: "es",
        id: undefined,
        kind: "country",
        language_label: "Spanish",
      }),
    ]);

    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.change(input, { target: { value: "spain" } });

    const option = await screen.findByRole("option", { name: "Spain" });
    expect(option).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("display")).toHaveTextContent("Spain");
    expect(screen.getByTestId("key")).toHaveTextContent("ES");
  });

  it("ignores malformed location-search data without crashing the picker", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockLocations([{ canonical_key: "US", display_name: "United States" }]);

    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /location/i }), {
      target: { value: "united" },
    });

    await waitFor(() => expect(warning).toHaveBeenCalledWith(expect.any(String)));
    expect(screen.getByText(/No matching locations/i)).toBeInTheDocument();
    expect(screen.getByTestId("key")).toHaveTextContent("US");
    warning.mockRestore();
  });

  it("assigns unique positional DOM ids when canonical keys sanitize identically", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "a b-c",
        country_code: "US",
        display_name: "Collision Country",
        id: undefined,
      }),
      locationSearchWireCandidate({
        canonical_key: "a-b c",
        city_name: "Collision City",
        country_code: "US",
        display_name: "Collision City, Test Region, United States",
        id: undefined,
        kind: "city",
        region_code: "US-TR",
        region_name: "Test Region",
      }),
    ]);

    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.change(input, { target: { value: "collision" } });

    const listbox = await screen.findByRole("listbox");
    const options = await within(listbox).findAllByRole("option");
    const optionIds = options.map((option) => option.id);
    const allIds = [
      listbox.id,
      ...Array.from(listbox.querySelectorAll<HTMLElement>("[id]"), (element) => element.id),
    ];

    expect(optionIds).toEqual([`${listbox.id}-opt-0`, `${listbox.id}-opt-1`]);
    expect(new Set(allIds).size).toBe(allIds.length);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", optionIds[0]);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", optionIds[1]);
  });

  it("does not query for terms below the minimum length", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /location/i }), {
      target: { value: "a" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("portals the listbox outside the field control so card overflow cannot clip it", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "FR",
        country_code: "FR",
        display_name: "France",
        id: "country:FR",
      }),
    ]);

    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.change(input, { target: { value: "fra" } });
    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest("fieldset")).toBeNull();
  });

  it("keeps the portaled listbox open when blur targets a listbox option", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "IT",
        country_code: "IT",
        display_name: "Italy",
        id: "country:IT",
      }),
    ]);
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.change(input, { target: { value: "ita" } });
    const listbox = await screen.findByRole("listbox");
    fireEvent.focusOut(input, { relatedTarget: await within(listbox).findByRole("option") });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("closes the portaled listbox on blur when focus leaves the field and listbox", async () => {
    mockLocations([
      locationSearchWireCandidate({
        canonical_key: "IT",
        country_code: "IT",
        display_name: "Italy",
        id: "country:IT",
      }),
    ]);

    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ita" } });
    await screen.findByRole("listbox");
    fireEvent.focusOut(input, { relatedTarget: null });
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("keeps the clear search target at the WCAG 2.2 AA minimum without moving its center", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /location/i }), {
      target: { value: "pol" },
    });

    expect(screen.getByRole("button", { name: "Clear location search" })).toHaveClass(
      "h-6",
      "w-6",
      "right-[6px]",
    );
  });

  it("does not commit free text", async () => {
    mockLocations([]);
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.change(input, { target: { value: "zzzz" } });

    expect(await screen.findByText(/No matching locations/i)).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("display")).toHaveTextContent("United States");
  });

  it("renders optional field help", () => {
    render(
      <LocationField
        help="Country or city used for localized results."
        messages={locationMessages}
        onChange={vi.fn()}
        value={country()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Country or city used for localized results." }),
    ).toBeInTheDocument();
  });
});
