import { aiResearchCatalogFixture } from "@/components/ai-research/ai-research-fixtures";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import historyMessages from "@/messages/core/en/research-history.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ModelPlayground } from "./ModelPlayground";

vi.mock("@/lib/actions/ai-research", () => ({
  analyzeAiResearchAction: vi.fn(),
  getAiResearchCatalogAction: vi.fn(),
}));
vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
vi.mock("./ModelPlaygroundHistory", () => ({
  ModelPlaygroundHistoryButton: () => null,
  ModelPlaygroundSuggestions: () => null,
}));
it.each([undefined, { enabled: false as const }])(
  "keeps the legacy estimate action when the switch is %j",
  async (nativeComposer) => {
    const analyzeAction = vi.fn(async () => {
      throw new Error("End of isolated legacy action test");
    });
    renderWithFeatureMessages(
      <ModelPlayground
        projectId="prj_test"
        projectName="Acme"
        domain="acme.example"
        entities={[]}
        topics={[]}
        sourceOverrides={[]}
        catalog={aiResearchCatalogFixture}
        engineOptions={[{ engine: "chat_gpt", model: "gpt-4.1-mini" }]}
        analyzeAction={analyzeAction}
        nativeComposer={nativeComposer}
      />,
      { messages: { ...sharedMessages, ...aiMessages, ...historyMessages } },
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: /Your question/ }),
      "Compare useful directories",
    );
    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(analyzeAction).toHaveBeenCalledOnce());
    expect(analyzeAction).toHaveBeenCalledWith(
      "prj_test",
      "prompt",
      expect.objectContaining({
        estimate_only: true,
        require_payment: true,
        prompt: "Compare useful directories",
      }),
    );
    expect(document.querySelector("[data-native-model-playground]")).toBeNull();
  },
);
