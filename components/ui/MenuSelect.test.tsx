import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuMultiSelect, MenuSelect } from "./MenuSelect";

const rect = {
  bottom: 34,
  height: 34,
  left: 0,
  right: 240,
  top: 0,
  width: 240,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

function Harness() {
  const [values, setValues] = useState(["us"]);
  return (
    <MenuMultiSelect
      ariaLabel="Markets"
      onChange={setValues}
      options={[
        { label: "United States", value: "us" },
        { label: "A very long selected location label", value: "long" },
      ]}
      values={values}
    />
  );
}

function SearchableMultiHarness() {
  const [values, setValues] = useState(["us"]);
  return (
    <MenuMultiSelect
      ariaLabel="Markets"
      onChange={setValues}
      options={[
        { label: "United States", value: "us" },
        { label: "Poland", value: "pl" },
      ]}
      searchPlaceholder="Search markets..."
      searchable
      values={values}
    />
  );
}

describe("MenuMultiSelect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("freezes trigger width while open so selection labels do not reposition the menu", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Markets" });
    fireEvent.click(trigger);
    expect(trigger).toHaveStyle({ width: "240px" });

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /very long/i }));
    expect(trigger).toHaveStyle({ width: "240px" });
    expect(trigger).toHaveTextContent("A very long selected location label");
  });

  it("focuses searchable input and closes from it with Escape", async () => {
    const user = userEvent.setup();
    render(<SearchableMultiHarness />);

    await user.click(screen.getByRole("button", { name: "Markets" }));
    const search = screen.getByRole("textbox", { name: "Search markets..." });
    expect(search).toHaveFocus();

    await user.type(search, "pol");
    expect(screen.getByRole("menuitemcheckbox", { name: "Poland" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Search markets..." })).not.toBeInTheDocument();
  });
});

describe("MenuSelect", () => {
  it("uses the shared select-sized toolbar treatment", () => {
    render(
      <MenuSelect
        ariaLabel="Location scope"
        onChange={() => undefined}
        options={[{ label: "All locations", value: "all" }]}
        value="all"
      />,
    );

    expect(screen.getByRole("button", { name: "Location scope" })).toHaveClass(
      "min-h-[34px]",
      "bg-bg-elev",
      "text-[12.5px]",
      "font-medium",
    );
  });

  it("focuses and types into search, then closes it with Escape", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Time zone"
        onChange={() => undefined}
        options={[
          { label: "UTC (GMT+00:00)", value: "UTC" },
          { label: "Europe/Warsaw (GMT+02:00)", value: "Europe/Warsaw" },
        ]}
        searchPlaceholder="Search time zones..."
        searchable
        value="Europe/Warsaw"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Time zone" }));
    const search = screen.getByRole("textbox", { name: "Search time zones..." });
    expect(search).toHaveFocus();
    await user.type(search, "warsaw");

    expect(screen.getByRole("menuitem", { name: /Europe\/Warsaw/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /UTC/ })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Search time zones..." })).not.toBeInTheDocument();
  });

  it("moves from search to the filtered options with ArrowDown", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Time zone"
        onChange={() => undefined}
        options={[
          { label: "UTC (GMT+00:00)", value: "UTC" },
          { label: "Europe/Warsaw (GMT+02:00)", value: "Europe/Warsaw" },
        ]}
        searchable
        value="UTC"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Time zone" }));
    await user.type(screen.getByRole("textbox", { name: "Search..." }), "warsaw");
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: /Europe\/Warsaw/ })).toHaveFocus();
  });
});
