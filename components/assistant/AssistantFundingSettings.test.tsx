import type { AssistantConfigView, FundingOptionView } from "@/lib/assistant/wire";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantFundingSettings } from "./AssistantFundingSettings";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/assistant/client/api", async (original) => ({
  ...(await original<typeof import("@/lib/assistant/client/api")>()),
  assistantFetch: mocks.save,
}));
beforeEach(() => {
  mocks.save.mockResolvedValue({});
});

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === "shared.controls.status" && key === "connected") return "Connected";
    if (namespace === "projectIntegrations.provider" && key === "notConnected")
      return "Not connected";
    return key;
  },
}));
vi.mock("@/components/ui/MenuSelect", () => ({
  MenuSelect: ({ ariaLabel }: { ariaLabel: string }) => <div aria-label={ariaLabel} />,
}));

function creditsOption(
  provider: FundingOptionView["provider"],
  available: boolean,
): FundingOptionView {
  return {
    mode: "credits",
    provider,
    available,
    reason: available ? null : "credits_unavailable",
    usage: null,
    credential: null,
  };
}

function config(
  creditsEnabled: boolean,
  funding: FundingOptionView[] = [],
  fundingPreference: AssistantConfigView["fundingPreference"] = [],
): AssistantConfigView {
  return {
    enabled: true,
    reason: null,
    project: { publicId: "prj_test", name: "Test", role: "member", readOnly: false },
    models: [
      {
        id: "m",
        provider: "openai",
        label: "Test",
        toolUse: true,
        efforts: [],
        defaultEffort: null,
        maxOutputTokens: 4096,
      },
    ],
    funding,
    fundingPreference,
    creditsEnabled,
    defaults: { modelId: "m", funding: null },
    starters: [],
    limits: { maxUserTextChars: 100, maxSteps: 6 },
  };
}

describe("AssistantFundingSettings", () => {
  it("renders one provider card per model provider and hides credits when the gate is off", () => {
    const { rerender } = render(
      <AssistantFundingSettings config={config(true)} projectRef="prj_test" />,
    );
    expect(screen.getAllByLabelText("sourceTitle")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "connect" })).toBeNull();
    expect(screen.queryByRole("button", { name: "saveFunding" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "aiLimitLink" })[0].getAttribute("href")).toBe(
      "/app/prj_test/usage",
    );
    rerender(<AssistantFundingSettings config={config(false)} projectRef="prj_test" />);
    expect(screen.queryByLabelText("sourceTitle")).toBeNull();
    expect(screen.queryByRole("link", { name: "aiLimitLink" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "connect" })).toHaveLength(3);
  });

  it("labels a credits-funded provider as connected inside the provider header", () => {
    render(
      <AssistantFundingSettings
        config={config(
          true,
          [creditsOption("anthropic", true), creditsOption("openai", false)],
          [{ provider: "anthropic", mode: "credits" }],
        )}
        projectRef="prj_test"
      />,
    );
    const funded = screen
      .getByRole("heading", { name: "Anthropic" })
      .closest("[data-provider-header]");
    const own = screen.getByRole("heading", { name: "OpenAI" }).closest("[data-provider-header]");
    expect(funded).not.toBeNull();
    expect(own).not.toBeNull();
    expect(within(funded as HTMLElement).getByText("Connected")).toBeInTheDocument();
    expect(within(funded as HTMLElement).queryByText("Not connected")).toBeNull();
    expect(within(own as HTMLElement).getByText("Not connected")).toBeInTheDocument();
    expect(funded?.querySelector("[role=img]")).not.toBeNull();
    expect(within(funded as HTMLElement).queryByText("sourceCreditsUnavailable")).toBeNull();
    expect(screen.getAllByText("sourceCreditsUnavailable").length).toBeGreaterThan(0);
  });
});

it("persists the Credits switch before reflecting the selected mode", async () => {
  render(
    <AssistantFundingSettings
      config={config(true, [], [{ provider: "openai", mode: "byok" }])}
      projectRef="prj_test"
    />,
  );
  const card = screen
    .getByRole("heading", { name: "OpenAI" })
    .closest("[data-provider-header]")?.parentElement;
  if (!card) throw new Error("Missing provider card");
  fireEvent.click(within(card).getByRole("radio", { name: "credits" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  const saved = mocks.save.mock.calls.at(-1);
  if (!saved) throw new Error("Funding preference was not saved");
  expect(JSON.parse(saved[1].body)).toEqual({
    project: "prj_test",
    provider: "openai",
    mode: "credits",
  });
  await waitFor(() => expect(within(card).getByRole("radio", { name: "credits" })).toBeChecked());
});
