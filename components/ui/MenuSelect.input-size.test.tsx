import { MenuMultiSelect, MenuSelect } from "@/components/ui/MenuSelect";
import { renderWithSharedMessages } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("MenuSelect input size", () => {
  it("uses the standard input control size when requested", () => {
    renderWithSharedMessages(
      <MenuSelect
        ariaLabel="Schedule day"
        onChange={() => undefined}
        options={[{ label: "Monday", value: "monday" }]}
        size="input"
        value="monday"
      />,
    );

    expect(screen.getByRole("button", { name: "Schedule day" })).toHaveClass(
      "min-h-10",
      "max-sm:min-h-11",
      "leading-5",
      "px-[13px]",
      "py-[9px]",
      "text-ui-body",
      "font-medium",
    );
  });
});

describe("MenuMultiSelect input size", () => {
  it("matches form controls while preserving multi-selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithSharedMessages(
      <MenuMultiSelect
        ariaLabel="Recipients"
        minSelected={0}
        onChange={onChange}
        options={[{ label: "Member", value: "member" }]}
        size="input"
        values={[]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Recipients" });
    expect(trigger).toHaveClass("min-h-10", "max-sm:min-h-11", "leading-5");
    expect(trigger).not.toHaveClass("min-h-[34px]");
    await user.click(trigger);
    const member = screen.getByRole("menuitemcheckbox", { name: "Member" });
    expect(member).not.toBeChecked();
    await user.click(member);
    expect(onChange).toHaveBeenCalledWith(["member"]);
  });
});
