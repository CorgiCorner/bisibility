import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AdminAccountLookupForm } from "./AdminAccountLookup";

it("submits an exact email or public account ID through the shared form", async () => {
  const user = userEvent.setup(),
    submit = vi.fn();
  render(<AdminAccountLookupForm busy={false} onSubmit={submit} />);
  await user.type(screen.getByRole("textbox"), "user@example.com");
  await user.click(screen.getByRole("button", { name: "Look up" }));
  expect(submit).toHaveBeenCalledWith({ identifier: "user@example.com" }, expect.anything());
});
it("keeps the pending lookup unavailable for duplicate submissions", () => {
  render(<AdminAccountLookupForm busy onSubmit={vi.fn()} />);
  expect(screen.getByRole("button")).toBeDisabled();
});
