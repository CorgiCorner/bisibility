import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { composerCopy } from "./model-playground-composer-copy.test-support";
import { renderNative } from "./model-playground-render.test-support";

const scenarios = [
  [
    "unavailable",
    "OpenAI is not available yet. Remove this column or choose another provider in settings.",
  ],
  [
    "reauth",
    "OpenAI needs re-authentication. Remove this column or choose a connected provider in settings.",
  ],
  [
    "disconnected",
    "OpenAI is disconnected. Remove this column or choose a connected provider in settings.",
  ],
  ["disabled", "OpenAI is disabled. Remove this column or choose an enabled provider in settings."],
  [
    "model",
    "vendor/shared-model is no longer in the OpenAI catalog. Remove this column or choose another model in settings.",
  ],
  [
    "settings",
    "Settings for vendor/shared-model exceed its supported bounds. Open settings to correct them or remove this column.",
  ],
  ["expired", "The OpenAI model list needs refreshing. Refresh models to continue."],
] as const;

describe("actionable column blockers", () => {
  it.each(scenarios)(
    "explains %s on the card and composer without promising a run",
    async (kind, sentence) => {
      const { preview, launch } = renderNative(true, (f) => {
        if (kind === "unavailable") f.connections[0].status = "planned";
        if (kind === "reauth") f.connections[0].status = "needs_reauth";
        if (kind === "disconnected")
          f.connections[0] = { ...f.connections[0], hasStoredCredentials: false };
        if (kind === "disabled") f.connections[0] = { ...f.connections[0], enabled: false };
        if (kind === "model") f.catalogs[0].models = [];
        if (kind === "settings") f.input.columns[0].settings.maxOutputTokens = 2049;
        if (kind === "expired") {
          f.catalogs[0].fetchedAt = "2020-01-01T00:00:00.000Z";
          f.catalogs[0].expiresAt = "2020-01-02T00:00:00.000Z";
        }
      });
      const card = document.querySelector("[data-column-id]") as HTMLElement;
      const composer = document.querySelector(
        '[data-model-playground-block="composer"]',
      ) as HTMLElement;
      expect(within(card).getByRole("alert")).toHaveTextContent(sentence);
      expect(card).not.toHaveTextContent(composerCopy.runAsks.split("{language}")[0]);
      expect(within(composer).getByRole("alert")).toHaveTextContent(
        `General Chat (OpenAI): ${sentence}`,
      );
      expect(composer).not.toHaveTextContent(composerCopy.invalidDraft);
      expect(composer).not.toHaveTextContent(composerCopy.estimating);
      expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
      expect(within(card).getByRole("button", { name: /^Settings:/ })).toBeEnabled();
      expect(within(card).getByRole("button", { name: /^Remove:/ })).toBeEnabled();
      expect(preview).not.toHaveBeenCalled();
      expect(launch).not.toHaveBeenCalled();
      await userEvent.click(within(card).getByRole("button", { name: /^Remove:/ }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
      expect(within(composer).queryByRole("alert")).toBeNull();
    },
  );
  it("labels web search once and exposes both states", async () => {
    renderNative();
    const composer = within(
      document.querySelector('[data-model-playground-block="composer"]') as HTMLElement,
    );
    expect(composer.getAllByText("Web search")).toHaveLength(1);
    const toggle = composer.getByRole("switch", { name: "Web search" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});
