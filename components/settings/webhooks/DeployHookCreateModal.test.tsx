import { DeployHookCreateModal } from "@/components/settings/webhooks/DeployHookCreateModal";
import {
  developersSettingsFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const nonEnglishWebhookMessages = {
  ...developersSettingsFeatureTestMessages,
  projectSettingsDevelopers: {
    ...developersSettingsFeatureTestMessages.projectSettingsDevelopers,
    webhooks: {
      ...developersSettingsFeatureTestMessages.projectSettingsDevelopers.webhooks,
      create: "Utwórz webhook",
      createTitle: "Utwórz webhook wdrożenia",
      newDescription: "Token jest dostępny tylko raz.",
      validationLabel: "Podaj nazwę webhooka.",
      webhookLabel: "Nazwa webhooka",
    },
  },
};

describe("DeployHookCreateModal", () => {
  it("keeps the stable default label in the create request", async () => {
    const user = userEvent.setup();
    const createHook = vi.fn().mockResolvedValue({
      id: "hook_example",
      label: "Production deploys",
      maskedValue: "fake_hook_******",
      raw: "fake_hook_one_time_value",
    });
    renderWithFeatureMessages(
      <DeployHookCreateModal
        createHook={createHook}
        endpointUrl="https://example.test/api/ingest/deploy"
        onClose={vi.fn()}
        open
        projectId="prj_example"
      />,
      { messages: nonEnglishWebhookMessages },
    );

    await user.click(screen.getByRole("button", { name: "Utwórz webhook" }));

    expect(createHook).toHaveBeenCalledWith({
      label: "Production deploys",
      projectId: "prj_example",
    });
  });

  it("keeps an invalid label in the dialog without sending a request", async () => {
    const user = userEvent.setup();
    const createHook = vi.fn();
    renderWithFeatureMessages(
      <DeployHookCreateModal
        createHook={createHook}
        endpointUrl="https://example.test/api/ingest/deploy"
        onClose={vi.fn()}
        open
        projectId="prj_example"
      />,
      { messages: nonEnglishWebhookMessages },
    );

    const label = screen.getByLabelText("Nazwa webhooka");
    await user.clear(label);
    await user.tab();

    expect(await screen.findByText("Podaj nazwę webhooka.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Utwórz webhook" })).toBeDisabled();
    expect(createHook).not.toHaveBeenCalled();
  });

  it("preserves the create payload and removes the one-time fixture after Done", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const createHook = vi.fn().mockResolvedValue({
      id: "hook_example",
      label: "Release events",
      maskedValue: "fake_hook_******",
      raw: "fake_hook_one_time_value",
    });
    renderWithFeatureMessages(
      <DeployHookCreateModal
        createHook={createHook}
        endpointUrl="https://example.test/api/ingest/deploy"
        onClose={onClose}
        open
        projectId="prj_example"
      />,
      { messages: nonEnglishWebhookMessages },
    );

    const label = screen.getByLabelText("Nazwa webhooka");
    await user.clear(label);
    await user.type(label, "Release events");
    await user.click(screen.getByRole("button", { name: "Utwórz webhook" }));

    expect(createHook).toHaveBeenCalledWith({ label: "Release events", projectId: "prj_example" });
    expect(await screen.findByText("Token jest dostępny tylko raz.")).toBeVisible();
    expect(screen.getByText("fake_hook_one_time_value")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText("fake_hook_one_time_value")).not.toBeInTheDocument();
  });
});
