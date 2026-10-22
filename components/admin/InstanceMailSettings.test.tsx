import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InstanceMailSettings } from "./InstanceMailSettings";

const actions = vi.hoisted(() => ({ save: vi.fn(), clear: vi.fn() }));
vi.mock("@/lib/actions/instance-mail-settings", () => ({
  saveInstanceMailSettings: actions.save,
  clearInstanceMailSettings: actions.clear,
}));

it("saves and clears mail settings without asking for an authenticator code", async () => {
  actions.save.mockResolvedValue({ status: "saved" });
  actions.clear.mockResolvedValue({ status: "cleared" });
  render(
    <InstanceMailSettings
      settings={{
        credentialsConfigured: true,
        envOverridesSaved: false,
        hasPasswordCredential: false,
        provider: "resend",
        sender: "Mail <ops@example.com>",
        twoFactorEnabled: true,
      }}
    />,
  );
  expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save mail settings" }));
  await waitFor(() => expect(actions.save).toHaveBeenCalledOnce());
  expect(actions.save.mock.calls[0][0]).not.toHaveProperty("code");
  fireEvent.click(screen.getByRole("button", { name: "Clear saved settings" }));
  await waitFor(() => expect(actions.clear).toHaveBeenCalledOnce());
  expect(actions.clear.mock.calls[0]).toEqual([]);
});
