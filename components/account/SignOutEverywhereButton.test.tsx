import { SignOutEverywhereButton } from "@/components/account/SignOutEverywhereButton";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("SignOutEverywhereButton", () => {
  it("right-aligns the sign-out action row", () => {
    render(
      <SignOutEverywhereButton
        otherSessionCount={1}
        signOutEverywhere={vi.fn().mockResolvedValue({ revokedCount: 1 })}
      />,
    );

    expect(screen.getByRole("button", { name: "Sign out everywhere" }).parentElement).toHaveClass(
      "justify-end",
    );
  });
});
