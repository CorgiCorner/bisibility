import { MenuSelect, type MenuSelectOptionGroup } from "@/components/ui/MenuSelect";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const groupedOptions: MenuSelectOptionGroup[] = [
  {
    id: "tracked",
    label: "Tracked markets",
    options: [
      { label: "United States / English", value: "US" },
      { label: "Spain / Spanish", value: "ES" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    searchOnly: true,
    options: [
      { label: "United Kingdom / English", value: "GB" },
      { label: "Poland / Polish", value: "PL", disabled: true, secondary: "unavailable" },
    ],
  },
];

describe("MenuSelect grouped", () => {
  it("shows tracked group and hides searchOnly catalog without a query", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Market"
        groups={groupedOptions}
        onChange={() => undefined}
        searchable
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.getByText("Tracked markets")).toBeInTheDocument();
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /United States/ })).toBeInTheDocument();
  });

  it("reveals and filters catalog when searching", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Market"
        groups={groupedOptions}
        onChange={() => undefined}
        searchable
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.type(screen.getByRole("textbox", { name: "Search..." }), "poland");
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Poland/ })).toBeInTheDocument();
    expect(screen.queryByText("Tracked markets")).not.toBeInTheDocument();
  });

  it("shows no-results message when search yields nothing", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Market"
        groups={groupedOptions}
        noResultsMessage="No market matches this search."
        onChange={() => undefined}
        searchable
        value="US"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.type(screen.getByRole("textbox", { name: "Search..." }), "xyz");
    expect(screen.getByText("No market matches this search.")).toBeInTheDocument();
  });

  it("shows empty message when no search and no visible groups", async () => {
    const user = userEvent.setup();
    const searchOnlyGroups: MenuSelectOptionGroup[] = [
      {
        id: "catalog",
        label: "Catalog",
        options: [{ label: "Poland / Polish", value: "PL" }],
        searchOnly: true,
      },
    ];
    render(
      <MenuSelect
        ariaLabel="Market"
        emptyMessage="Type to search the catalog."
        groups={searchOnlyGroups}
        onChange={() => undefined}
        searchable
        value="ZZ"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.getByText("Type to search the catalog.")).toBeInTheDocument();
  });

  it("does not render empty non-search groups", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Market"
        emptyMessage="No tracked markets."
        groups={[{ id: "empty", label: "Tracked markets", options: [] }]}
        onChange={() => undefined}
        searchable
        value="ZZ"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.queryByText("Tracked markets")).not.toBeInTheDocument();
    expect(screen.getByText("No tracked markets.")).toBeInTheDocument();
  });

  it("resolves selected option across hidden searchOnly groups", () => {
    render(
      <MenuSelect
        ariaLabel="Market"
        groups={groupedOptions}
        onChange={() => undefined}
        value="GB"
      />,
    );

    expect(screen.getByRole("button", { name: "Market" })).toHaveTextContent(
      "United Kingdom / English",
    );
  });

  it("selects with ArrowDown and Enter, closes, and returns focus on Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <MenuSelect
        ariaLabel="Market"
        groups={groupedOptions}
        onChange={onChange}
        searchable
        value="ZZ"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /United States/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("US");
    expect(screen.queryByText("Tracked markets")).not.toBeInTheDocument();

    rerender(
      <MenuSelect
        ariaLabel="Market"
        groups={groupedOptions}
        onChange={onChange}
        searchable
        value="US"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Market" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Market" })).toHaveFocus();
  });
});
