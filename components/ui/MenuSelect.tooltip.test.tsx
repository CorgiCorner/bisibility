import { MenuSelect } from "@/components/ui/MenuSelect";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

function TooltipMenu() {
  return (
    <MenuSelect
      ariaLabel="Scope"
      onChange={() => undefined}
      options={[{ label: "All", value: "all" }]}
      triggerTitle="Choose a scope for this project"
      value="all"
    />
  );
}

describe("MenuSelect tooltip", () => {
  it("exposes triggerTitle as a description with no native title", () => {
    render(<TooltipMenu />);

    const trigger = screen.getByRole("button", { name: "Scope" });
    expect(trigger).not.toHaveAttribute("title");
    expect(trigger).toHaveAttribute("aria-describedby");
    const describedBy = trigger.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy ?? "")).toHaveTextContent(
      "Choose a scope for this project",
    );
  });

  it("opens visually on hover", async () => {
    const user = userEvent.setup();
    render(<TooltipMenu />);

    await user.hover(screen.getByRole("button", { name: "Scope" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Choose a scope for this project");
  });

  it("opens visually on keyboard focus", async () => {
    const user = userEvent.setup();
    render(<TooltipMenu />);

    const trigger = screen.getByRole("button", { name: "Scope" });
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Choose a scope for this project");
  });
});
