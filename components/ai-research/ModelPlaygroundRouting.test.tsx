import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { columnResult } from "@/lib/model-playground/result-fixtures.test-support";
import { projectColumnResult } from "@/lib/model-playground/result-view";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ModelPlaygroundColumnFooter } from "./ModelPlaygroundColumnFooter";
import { ModelPlaygroundColumnFrame } from "./ModelPlaygroundColumnFrame";
import { renderNative } from "./model-playground-render.test-support";

// Synthetic selections and observed identities, never live captures.
it("offers an optional workspace field only for Anthropic and validates it locally", async () => {
  renderNative();
  await userEvent.click(screen.getAllByRole("button", { name: /^Settings:/ })[1]);
  const drawer = within(screen.getByRole("dialog"));
  expect(drawer.getByLabelText("Workspace ID")).toBeVisible();
  expect(drawer.getByText(/key tied to a workspace cannot switch/i)).toBeVisible();
  expect(drawer.queryByLabelText("Allowed providers")).toBeNull();
  await userEvent.type(drawer.getByLabelText("Workspace ID"), "invalid");
  expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();
});
it("follows the comma-separated multi-value input precedent and rejects an explicit invalid set", async () => {
  renderNative(true, (fixture) => {
    const column = fixture.input.columns[1];
    column.providerId = "vercel_ai_gateway";
    column.connectionId = fixture.connections[3].connectionId as `conn_${string}`;
  });
  await userEvent.click(screen.getAllByRole("button", { name: /^Settings:/ })[1]);
  const drawer = within(screen.getByRole("dialog"));
  const field = drawer.getByLabelText("Allowed providers");
  expect(drawer.queryByLabelText("Workspace ID")).toBeNull();
  await userEvent.type(field, "bedrock, anthropic");
  expect(drawer.queryByText("bedrock, anthropic")).toBeNull();
  expect(drawer.getByRole("button", { name: "Save changes" })).toBeEnabled();
  await userEvent.type(field, ", bedrock");
  expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(drawer.queryByText("bedrock, anthropic, bedrock")).toBeNull();
  await userEvent.clear(field);
  await userEvent.type(field, "anthropic, invalid-entry");
  expect(drawer.getByText("Use 1 to 16 unique, supported provider slugs.")).toBeVisible();
  await userEvent.clear(field);
  expect(drawer.getByRole("button", { name: "Save changes" })).toBeEnabled();
});
it.each(["anthropic", "vercel_ai_gateway"] as const)(
  "shows observed %s routing notices while retaining the answer",
  async (providerId) => {
    const result = columnResult(0);
    result.column.providerId = providerId;
    if (providerId === "anthropic") {
      result.column.settings.workspaceId = "wrkspc_RequestedSynthetic";
      result.resolvedWorkspaceId = "wrkspc_ObservedSynthetic";
    } else {
      result.column.settings.allowedProviders = ["bedrock"];
      result.actualProviderId = "anthropic";
      result.routingViolation = "provider_outside_allowed_set";
    }
    const column = projectColumnResult(result);
    renderWithFeatureMessages(
      <ModelPlaygroundColumnFrame column={column} onRemove={vi.fn()}>
        <p>{result.answer}</p>
        <ModelPlaygroundColumnFooter column={column} />
      </ModelPlaygroundColumnFrame>,
      { messages: aiMessages },
    );
    expect(screen.getByText(result.answer as string)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      providerId === "anthropic" ? "workspace differs" : "outside the allowed set",
    );
    const details = screen.getByText(
      providerId === "anthropic" ? /wrkspc_ObservedSynthetic/ : /Allowed: bedrock/,
    );
    expect(details).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Usage and cost details" }));
    expect(details).toBeVisible();
  },
);
