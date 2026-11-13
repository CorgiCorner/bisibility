import { renderWithAccountMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AccountPrivacyChoices } from "./AccountPrivacyChoices";

describe("Account privacy choices", () => {
  it("uses a single secondary header action without an empty card and opens the privacy dialog", async () => {
    const { container } = render(<AccountPrivacyChoices />);
    expect(screen.getByRole("heading", { name: "Privacy choices" })).toBeVisible();
    const action = screen.getByRole("button", { name: "Review choices" });
    expect(action).toHaveAttribute("data-variant", "secondary");
    expect(action).toHaveAttribute("data-size", "md");
    expect(container.querySelector("section > .rounded-card")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(action);
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
