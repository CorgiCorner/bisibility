import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("toggles password visibility with accessible labels", () => {
    render(<PasswordInput aria-label="API password" />);

    const input = screen.getByLabelText("API password") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input).toHaveClass("pr-12");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });
});
