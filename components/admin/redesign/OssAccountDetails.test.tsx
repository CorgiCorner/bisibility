import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OssAdministration } from "./OssAdministration";

const account = {
  id: "public-27",
  email: "row27@example.com",
  status: "active" as const,
  created: "2026-10-01",
  lastActive: "2026-11-01",
  projects: 2,
  keywords: 14,
  connections: "1",
};
it("routes a listed account mutation to its public ID and updates its list status", async () => {
  const lookup = vi.fn();
  const action = vi
    .fn()
    .mockResolvedValue({ status: "completed", accountStatus: "deactivated", message: "" });
  render(
    <OssAdministration
      account={null}
      accounts={[account]}
      section="accounts"
      onLookup={lookup}
      onAccountAction={action}
      onSaveMail={vi.fn()}
      onClearMail={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: account.email }));
  expect(lookup).toHaveBeenCalledWith(account.id);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Account details" })).getByRole("button", {
      name: "Deactivate account",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));
  await waitFor(() => expect(action).toHaveBeenCalledWith("deactivate", account.id));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Account details" })).getByRole("button", {
      name: "Close drawer",
    }),
  );
  expect(
    within(screen.getByRole("table", { name: "Accounts" })).getByText("deactivated"),
  ).toBeInTheDocument();
});
it("preserves the security-enable link and prevents a gated state change from the drawer", () => {
  const action = vi.fn();
  render(
    <OssAdministration
      account={null}
      accounts={[account]}
      section="accounts"
      twoFactorEnabled={false}
      onLookup={vi.fn()}
      onAccountAction={action}
      onSaveMail={vi.fn()}
      onClearMail={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: account.email }));
  const drawer = screen.getByRole("dialog", { name: "Account details" });
  expect(
    within(drawer).queryByRole("button", { name: "Deactivate account" }),
  ).not.toBeInTheDocument();
  expect(
    within(drawer).getByRole("link", { name: "Enable two-factor authentication" }),
  ).toHaveAttribute("href", expect.stringContaining("/app/account/security?returnTo="));
  expect(action).not.toHaveBeenCalled();
});
