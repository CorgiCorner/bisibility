import { MenuSelect, type MenuSelectOptionGroup } from "@/components/ui/MenuSelect";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

const groups: MenuSelectOptionGroup[] = [
  {
    id: "tracked",
    label: "Tracked countries",
    options: [{ label: "United States", value: "US" }],
  },
  {
    id: "catalog",
    label: "All countries",
    options: [
      { label: "Belgium", value: "BE" },
      { label: "Spain", value: "ES" },
      { label: "Sweden", value: "SE" },
    ],
  },
];

function openMenu() {
  return render(
    <MenuSelect
      ariaLabel="Country"
      groups={groups}
      onChange={() => undefined}
      searchable
      searchPlaceholder="Search countries"
      value="US"
    />,
  );
}

describe("MenuSelect search field", () => {
  it("pins the search field to the menu's top edge so a long list scrolls under it", async () => {
    const user = userEvent.setup();
    openMenu();

    await user.click(screen.getByRole("button", { name: "Country" }));

    const field = screen.getByRole("textbox", { name: "Search countries" });
    expect(field.closest("div")?.parentElement).toHaveClass("sticky", "-top-1.5", "bg-bg-elev");
  });

  it("reads a filtered list from its first match instead of the previous scroll offset", async () => {
    const user = userEvent.setup();
    openMenu();

    await user.click(screen.getByRole("button", { name: "Country" }));
    const menu = screen.getByRole("menu", { name: "Country" });
    menu.scrollTop = 240;

    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "spa");

    expect(menu.scrollTop).toBe(0);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Spain"]);
  });
});
