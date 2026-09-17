import { ApiKeyCreateModal } from "@/components/settings/api-keys/ApiKeyCreateModal";
import {
  developersSettingsFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const nonEnglishApiKeyMessages = {
  ...developersSettingsFeatureTestMessages,
  projectSettingsDevelopers: {
    ...developersSettingsFeatureTestMessages.projectSettingsDevelopers,
    apiKeys: {
      ...developersSettingsFeatureTestMessages.projectSettingsDevelopers.apiKeys,
      create: "Utwórz klucz",
      createTitle: "Utwórz klucz API",
      keyName: "Nazwa klucza",
      newDescription: "Pełny sekret jest dostępny tylko raz.",
      validationName: "Podaj nazwę klucza.",
    },
  },
};

function renderModal(issueKey = vi.fn()) {
  return renderWithFeatureMessages(
    <ApiKeyCreateModal issueKey={issueKey} onClose={vi.fn()} open projectId="prj_example" />,
    { messages: nonEnglishApiKeyMessages },
  );
}

describe("ApiKeyCreateModal", () => {
  it("renders localized validation and keeps an invalid request from leaving the form", async () => {
    const user = userEvent.setup();
    const issueKey = vi.fn();
    renderModal(issueKey);

    const name = screen.getByLabelText("Nazwa klucza");
    await user.type(name, " ");
    await user.tab();

    expect(await screen.findByText("Podaj nazwę klucza.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Utwórz klucz" })).toBeDisabled();
    expect(issueKey).not.toHaveBeenCalled();
  });

  it("shows a non-secret test fixture only in the one-time reveal and preserves the issue payload", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const issueKey = vi.fn().mockResolvedValue({
      expiresInDays: 90,
      maskedValue: "fake_key_test_******",
      name: "CI deploy checks",
      raw: "fake_key_test_one_time_value",
      scope: "write",
    });
    renderWithFeatureMessages(
      <ApiKeyCreateModal issueKey={issueKey} onClose={onClose} open projectId="prj_example" />,
      { messages: nonEnglishApiKeyMessages },
    );

    await user.type(screen.getByLabelText("Nazwa klucza"), "CI deploy checks");
    await user.click(screen.getByRole("button", { name: "Utwórz klucz" }));

    expect(issueKey).toHaveBeenCalledWith({
      expiresInDays: 90,
      name: "CI deploy checks",
      projectId: "prj_example",
      scope: "write",
    });
    expect(await screen.findByText("Pełny sekret jest dostępny tylko raz.")).toBeVisible();
    expect(screen.getByText("fake_key_test_one_time_value")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText("fake_key_test_one_time_value")).not.toBeInTheDocument();
  });

  it("keeps the shared digest remedy for a rejected server action", async () => {
    const user = userEvent.setup();
    const serverError = Object.assign(new Error("Server Components render failed."), {
      digest: "digest-test-123",
    });
    const issueKey = vi.fn().mockRejectedValue(serverError);
    renderModal(issueKey);

    await user.type(screen.getByLabelText("Nazwa klucza"), "CI deploy checks");
    await user.click(screen.getByRole("button", { name: "Utwórz klucz" }));

    expect(
      await screen.findByText("Check failed on our side (ref digest-test-123). Retry in a moment."),
    ).toBeVisible();
  });
});
