import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntegrationsByoNote } from "./IntegrationsByoNote";

describe("IntegrationsByoNote", () => {
  it("renders the shared informational provider banner", () => {
    render(<IntegrationsByoNote />);

    const title = screen.getByRole("heading", { name: "Bring your own providers." });
    const detail = screen.getByText(
      "In self-hosted bisibility you connect your own accounts. Credentials stay in your instance and provider usage is billed directly between you and each provider.",
    );
    const banner = title.closest("section");
    const icon = screen.getByTestId("first-check-banner-icon");

    expect(banner).toBeInTheDocument();
    expect(detail.tagName).toBe("P");
    expect(detail.previousElementSibling).toBe(title);
    expect(icon).toHaveAttribute("data-icon", "puzzle-piece");
    expect(icon).toHaveAttribute("data-weight", "regular");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
