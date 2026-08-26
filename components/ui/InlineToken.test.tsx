import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineToken } from "./InlineToken";

describe("InlineToken", () => {
  it("uses compact control geometry rather than a full pill", () => {
    render(<InlineToken value="rank tracker" />);

    const token = screen.getByText("rank tracker").parentElement;
    expect(token).toHaveClass("h-[26px]", "rounded-control", "bg-bg-elev", "border-border");
    expect(token).not.toHaveClass("rounded-full");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders an optional 16px dismiss control with an accessible label", () => {
    const onDismiss = vi.fn();
    render(
      <InlineToken dismissLabel="Remove rank tracker" onDismiss={onDismiss} value="rank tracker" />,
    );

    const dismiss = screen.getByRole("button", { name: "Remove rank tracker" });
    expect(dismiss).toHaveAttribute("type", "button");
    expect(dismiss).toHaveClass("size-4", "items-center", "justify-center", "rounded-[4px]");
    expect(dismiss).not.toHaveClass("rounded-full");
    const dismissIcon = dismiss.querySelector("svg");
    expect(dismissIcon).toBeInTheDocument();
    expect(dismissIcon).toHaveAttribute("width", "14");

    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
