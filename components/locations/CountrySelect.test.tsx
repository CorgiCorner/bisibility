import { CountrySelect } from "@/components/locations/CountrySelect";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const countries = [
  { code: "SE", label: "Sweden" },
  { code: "ES", label: "Spain" },
  { code: "US", label: "United States" },
  { code: "BE", label: "Belgium" },
  { code: "ZW", label: "Zimbabwe", disabled: true, secondary: "unavailable", tooltip: "No data" },
];

function renderSelect(overrides: Partial<React.ComponentProps<typeof CountrySelect>> = {}) {
  const onChange = vi.fn();
  render(
    <CountrySelect
      ariaLabel="Country"
      countries={countries}
      onChange={onChange}
      trackedCodes={["US", "es"]}
      value="US"
      {...overrides}
    />,
  );
  return onChange;
}

describe("CountrySelect", () => {
  it("names the selected country and carries its flag on the trigger", () => {
    renderSelect();

    const trigger = screen.getByRole("button", { name: "Country" });
    expect(trigger).toHaveTextContent("United States");
    expect(trigger.querySelector("[data-country-flag='US']")).toBeInTheDocument();
  });

  it("pins tracked countries above an alphabetical catalog, all visible without typing", async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole("button", { name: "Country" }));

    expect(screen.getByText("Tracked countries")).toBeVisible();
    expect(screen.getByText("All countries")).toBeVisible();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Spain",
      "United States",
      "Belgium",
      "Sweden",
      "Zimbabweunavailable",
    ]);
  });

  it("drops the tracked heading when the project tracks nothing yet", async () => {
    const user = userEvent.setup();
    renderSelect({ trackedCodes: [], value: "" });

    await user.click(screen.getByRole("button", { name: "Country" }));

    expect(screen.queryByText("Tracked countries")).not.toBeInTheDocument();
    expect(screen.queryByText("All countries")).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(countries.length);
  });

  it("matches on country name and on ISO code, and reports an empty search plainly", async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole("button", { name: "Country" }));
    const search = screen.getByRole("textbox", { name: "Search countries" });

    await user.type(search, "swe");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Sweden"]);

    await user.clear(search);
    await user.type(search, "be");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Belgium"]);

    await user.clear(search);
    await user.type(search, "atlantis");
    expect(screen.getByText("No country matches this search.")).toBeInTheDocument();
  });

  it("reports the picked country by its code and leaves a disabled one unselectable", async () => {
    const user = userEvent.setup();
    const onChange = renderSelect();

    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.click(screen.getByRole("menuitem", { name: /Zimbabwe/ }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("menuitem", { name: "Belgium" }));
    expect(onChange).toHaveBeenCalledWith("BE");
  });
});
