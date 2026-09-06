import { MenuSelect } from "@/components/ui/MenuSelect";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("MenuSelect input size", () => {
  it("uses the standard input control size when requested", () => {
    render(
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
      "px-[13px]",
      "py-[9px]",
      "text-ui-body",
      "font-medium",
    );
  });
});
