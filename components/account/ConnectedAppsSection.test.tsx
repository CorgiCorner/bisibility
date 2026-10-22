import { renderWithAccountMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ConnectedApp } from "@/lib/schemas/connected-app";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectedAppsSection } from "./ConnectedAppsSection";

const app: ConnectedApp = {
  clientId: "registered-app",
  name: "My assistant",
  dynamic: true,
  scopes: ["read", "tokens:write", "offline_access"],
  connectedAt: "2026-10-01T12:00:00Z",
  lastUsedAt: "2026-10-22T12:00:00Z",
  createdTokens: [],
};
function setup(
  createdTokens: ConnectedApp["createdTokens"] = [],
  revokeApp = vi.fn().mockResolvedValue({ revoked: true }),
) {
  const user = userEvent.setup();
  render(
    <ConnectedAppsSection
      apps={[{ ...app, createdTokens }]}
      dateFormat="long"
      revokeApp={revokeApp}
    />,
  );
  return { user, revokeApp };
}
describe("Connected apps", () => {
  it("renders names, registration provenance, permissions and dates", () => {
    setup();
    expect(screen.getByText("My assistant")).toBeVisible();
    expect(screen.getByText("Registered automatically")).toBeVisible();
    expect(screen.getByText(/Read project data, Create API tokens, Renew access/)).toBeVisible();
    expect(screen.getByText(/Connected Oct 1, 2026/)).toHaveTextContent("Last used Oct 22, 2026");
    expect(screen.getByRole("link", { name: "Manage personal tokens" })).toHaveAttribute(
      "href",
      "#personal-tokens",
    );
  });
  it("renders the empty state", () => {
    render(<ConnectedAppsSection apps={[]} dateFormat="long" revokeApp={vi.fn()} />);
    expect(screen.getByText("No apps are connected to your account.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Revoke/ })).not.toBeInTheDocument();
  });
  it("confirms without a PAT checkbox when none are reliably linked", async () => {
    const { user, revokeApp } = setup();
    await user.click(screen.getByRole("button", { name: "Revoke access for My assistant" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Access already issued can keep working for up to 1 hour."),
    ).toBeVisible();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    expect(revokeApp).toHaveBeenCalledWith(app.clientId, { revokeCreatedTokens: false });
  });
  it("lists linked tokens, defaults unchecked and resets on reopening", async () => {
    const { user } = setup([{ id: "pat_proven", name: "Automation" }]);
    expect(screen.getByText("Automation")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Revoke access for My assistant" }));
    const checkbox = screen.getByRole("checkbox", {
      name: "Also revoke 1 API token this app created",
    });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Revoke access for My assistant" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("sends the opt-in and blocks duplicate submissions while pending", async () => {
    let resolve!: () => void;
    const revokeApp = vi.fn().mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { user } = setup([{ id: "pat_proven", name: "Automation" }], revokeApp);
    await user.click(screen.getByRole("button", { name: "Revoke access for My assistant" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke" }));
    expect(revokeApp).toHaveBeenCalledWith(app.clientId, { revokeCreatedTokens: true });
    expect(screen.getByRole("button", { name: "Revoking" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    await act(async () => resolve());
  });
  it("keeps failures visible and permits retry", async () => {
    const { user } = setup([], vi.fn().mockRejectedValue(new Error("failure")));
    await user.click(screen.getByRole("button", { name: "Revoke access for My assistant" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "App access could not be revoked. Try again.",
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke" }),
      ).toBeEnabled(),
    );
  });
});
