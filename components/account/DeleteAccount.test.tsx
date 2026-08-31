import { DeleteAccount } from "@/components/account/DeleteAccount";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("DeleteAccount", () => {
  it("right-aligns the delete account action row", () => {
    render(<DeleteAccount email="owner@example.com" />);

    expect(screen.getByRole("button", { name: "Delete account" }).parentElement).toHaveClass(
      "justify-end",
    );
  });
});
