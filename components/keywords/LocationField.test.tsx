import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationField, type LocationFieldValue } from "./LocationField";
import { countryValueForName } from "./location-picker-data";

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
    // The suggestion list overlays the content below instead of pushing it down.
    expect(screen.getByRole("listbox")).toHaveClass("absolute");

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

  it("does not query for terms below the minimum length", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /location/i }), {
      target: { value: "a" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
