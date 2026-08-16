import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { countryValueForName } from "@/components/keywords/location-picker-data";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

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
      <LocationField onChange={setValue} projectId="prj_1" value={value} />
      <output data-testid="kind">{value.kind}</output>
      <output data-testid="display">{value.displayName}</output>
      <output data-testid="key">{value.canonicalKey}</output>
    </div>
  );
}

describe("LocationField", () => {
  it("keeps form and toolbar fields transparent with a visible border", () => {
    const { rerender } = render(<LocationField onChange={vi.fn()} value={country()} />);
    expect(screen.getByRole("combobox", { name: /location/i })).toHaveClass(
      "bg-transparent",
      "border-border-strong",
    );
    rerender(<LocationField onChange={vi.fn()} value={country()} variant="toolbar" />);
    expect(screen.getByRole("combobox", { name: /location/i })).toHaveClass(
      "bg-transparent",
      "border-border-strong",
    );
  });

  it("queries mixed suggestions and preserves the selected city key", async () => {
    mockLocations([
      {
        canonical_key: "AU",
        city_name: null,
        country_code: "AU",
        display_name: "Australia",
        id: "country:AU",
        kind: "country",
        region_name: null,
      },
      {
        canonical_key: "US/Texas/Austin",
        city_name: "Austin",
        country_code: "US",
        display_name: "Austin, Texas, United States",
        id: "location:US/Texas/Austin",
        kind: "city",
        region_name: "Texas",
      },
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
    expect(await screen.findByText("Cities")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Austin"));
    expect(screen.getByTestId("kind")).toHaveTextContent("city");
    expect(screen.getByTestId("display")).toHaveTextContent("Austin, Texas, United States");
    expect(screen.getByTestId("key")).toHaveTextContent("US/Texas/Austin");
  });

  it("supports keyboard selection", async () => {
    mockLocations([
      {
        canonical_key: "DE",
        city_name: null,
        country_code: "DE",
        display_name: "Germany",
        id: "country:DE",
        kind: "country",
        region_name: null,
      },
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
      {
        canonical_key: "ES",
        city_name: null,
        country_code: "ES",
        display_name: "Spain",
        hl: "es",
        kind: "country",
        language_label: "Spanish",
        region_code: null,
        region_name: null,
      },
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

  it("assigns unique positional DOM ids when canonical keys sanitize identically", async () => {
    mockLocations([
      {
        canonical_key: "a b-c",
        city_name: null,
        country_code: "US",
        display_name: "Collision Country",
        kind: "country",
        region_name: null,
      },
      {
        canonical_key: "a-b c",
        city_name: "Collision City",
        country_code: "US",
        display_name: "Collision City, Test Region, United States",
        kind: "city",
        region_name: "Test Region",
      },
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
      {
        canonical_key: "FR",
        city_name: null,
        country_code: "FR",
        display_name: "France",
        id: "country:FR",
        kind: "country",
        region_name: null,
      },
    ]);

    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /location/i });
    fireEvent.change(input, { target: { value: "fra" } });
    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest("fieldset")).toBeNull();
  });

  it("keeps the portaled listbox open when blur targets a listbox option", async () => {
    mockLocations([
      {
        canonical_key: "IT",
        city_name: null,
        country_code: "IT",
        display_name: "Italy",
        id: "country:IT",
        kind: "country",
        region_name: null,
      },
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
      {
        canonical_key: "IT",
        city_name: null,
        country_code: "IT",
        display_name: "Italy",
        id: "country:IT",
        kind: "country",
        region_name: null,
      },
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

    expect(await screen.findByText(/powered by your connected providers/i)).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("display")).toHaveTextContent("United States");
  });

  it("renders optional field help", () => {
    render(
      <LocationField
        help="Country or city used for localized results."
        onChange={vi.fn()}
        value={country()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Country or city used for localized results." }),
    ).toBeInTheDocument();
  });
});
