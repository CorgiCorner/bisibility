import { MenuMultiSelect, MenuSelect } from "@/components/ui/MenuSelect";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    await user.clear(search);
    await user.type(search, "missing");
    expect(screen.getByText("No results")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Search markets..." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markets" })).toHaveFocus();
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

    const trigger = screen.getByRole("button", { name: "Location scope" });
    expect(trigger).toHaveClass(
      "min-h-[34px]",
      "bg-transparent",
      "text-[12.5px]",
      "font-normal",
      "text-fg",
    );
    expect(trigger).not.toHaveClass("font-medium", "font-semibold");
    expect(trigger.querySelector(".truncate")).toHaveClass("text-fg");
    expect(trigger.querySelector(".truncate")).not.toHaveClass("text-fg-muted");
  });

  it("optionally renders compact content with a pinned caret", () => {
    render(
      <MenuSelect
        ariaLabel="Research mode"
        compact
        leadingLabel="Mode:"
        onChange={() => undefined}
        options={[{ label: "Auto", value: "auto" }]}
        pinCaret
        value="auto"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Research mode" });
    expect(trigger).toHaveClass("text-[12px]", "leading-4");
    expect(trigger.querySelector("[data-menu-select-content]")).toHaveTextContent("Mode:Auto");
    expect(trigger.querySelector("[data-menu-select-caret]")).toHaveClass("ml-auto");
  });

  it("sizes compact menus to content instead of the narrow trigger", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Tag"
        compact
        onChange={() => undefined}
        options={[
          { label: "All tags", value: "all" },
          { label: "High intent", value: "high" },
        ]}
        triggerClassName="min-h-7 rounded-full px-2.5 text-[11.5px] font-semibold"
        value="all"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tag" }));
    const paper = screen.getByRole("menu").closest(".MuiPaper-root");
    expect(paper).toHaveStyle({
      boxShadow: "none",
      minWidth: "180px",
      width: "max-content",
    });
    expect(paper).not.toHaveClass("MuiPaper-elevation8");
  });

  it("supports a local scroll height while keeping the standard popover gap", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Property"
        menuMaxHeight="min(192px, calc(100dvh - 84px))"
        onChange={() => undefined}
        options={Array.from({ length: 6 }, (_, index) => ({
          label: `Property ${index + 1}`,
          value: String(index + 1),
        }))}
        value="1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Property" }));
    const paper = screen.getByRole("menu").closest(".MuiPaper-root");
    expect(paper).toHaveStyle({
      marginTop: "6px",
      maxHeight: "min(192px, calc(100dvh - 84px))",
      overflowY: "auto",
    });
  });

  it("keeps the default menu height when no local cap is provided", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Default property"
        onChange={() => undefined}
        options={[{ label: "Property", value: "property" }]}
        value="property"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Default property" }));
    const paper = screen.getByRole("menu").closest(".MuiPaper-root");
    expect(paper).toHaveStyle({ marginTop: "6px", maxHeight: "min(360px, calc(100dvh - 84px))" });
  });

  it("does not bold the selected option in the open menu", async () => {
    const user = userEvent.setup();
    render(
      <MenuSelect
        ariaLabel="Research mode"
        onChange={() => undefined}
        options={[
          { label: "Auto", value: "auto" },
          { label: "Related", value: "related" },
        ]}
        value="auto"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Research mode" }));
    const current = screen.getByRole("menuitem", { name: "Auto" });
    expect(current).toHaveAttribute("data-current", "true");
    expect(current.querySelector(".font-semibold, .font-medium")).toBeNull();
    expect(current.querySelector(".text-fg")).toHaveTextContent("Auto");
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
    await user.clear(search);
    await user.type(search, "missing");
    expect(screen.getByText("No results")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Search time zones..." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Time zone" })).toHaveFocus();
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
