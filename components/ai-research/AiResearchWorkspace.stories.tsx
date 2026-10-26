import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Observed, Synthetic } from "./AiResearchResults.stories";
import { AiResearchWorkspace } from "./AiResearchWorkspace";
import { aiResearchCatalogFixture, fixtureResearchAction } from "./ai-research-fixtures";

const meta = {
  title: "Research/AI Workspace",
  component: AiResearchWorkspace,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={{ ...sharedMessages, ...aiMessages }}
      >
        <div className="min-h-screen bg-bg p-5 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen", themeControls: false },
  args: {
    catalog: aiResearchCatalogFixture,
    projectId: "prj_example",
    domain: "acme.example",
    mode: "visibility",
    history: [
      { id: "agr_example", title: "Brand Visibility: Acme", createdAt: "2026-10-02T12:00:00Z" },
    ],
    analyzeAction: fixtureResearchAction,
  },
} satisfies Meta<typeof AiResearchWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Visibility: Story = {
  args: {
    initialOutcome: {
      ok: true,
      estimate: false,
      cached: false,
      reportId: "agr_example",
      costCents: 10.1,
      result: Observed.args.result,
    },
  },
};
export const PromptPlayground: Story = {
  args: {
    engineOptions: [
      { engine: "chat_gpt", model: "gpt-5.6-luna" },
      { engine: "claude", model: "claude-sonnet-5" },
      { engine: "gemini", model: "gemini-4-argon" },
      { engine: "perplexity", model: "sonar-pro" },
    ],
    mode: "prompt",
    analyzeAction: fixtureResearchAction,
    history: [
      { id: "agr_example", title: "Prompt comparison: Acme", createdAt: "2026-10-02T12:00:00Z" },
    ],
    initialOutcome: {
      ok: true,
      estimate: false,
      cached: false,
      reportId: "agr_example",
      costCents: 0.11,
      result: Synthetic.args.result,
    },
  },
};
export const ReadOnly: Story = { args: { canRun: false } };
export const Empty: Story = { args: { history: [] } };

export const CatalogUnavailable: Story = {
  args: { mode: "prompt", catalog: undefined, catalogError: "Provider unavailable" },
};

export const PricingUnavailable: Story = {
  args: {
    mode: "prompt",
    catalog: {
      ...aiResearchCatalogFixture,
      models: aiResearchCatalogFixture.models.map((model) => ({ ...model, priceAvailable: false })),
    },
  },
};

export const PlaygroundWithoutSource: Story = {
  args: {
    mode: "prompt",
    catalog: undefined,
    catalogFailure: "no_source",
    supportingProviders: ["DataForSEO"],
  },
};

export const OwnKeyLuna: Story = {
  args: {
    analyzeAction: async (...args) => {
      const result = await fixtureResearchAction(...args);
      return result.ok && result.estimate
        ? {
            ...result,
            payment: paymentQuote({
              charge: {
                value: "0.12",
                certainty: "estimate",
                unit: { kind: "currency", code: "USD" },
              },
            }),
          }
        : result;
    },
    mode: "prompt",
    engineOptions: [],
    history: [],
    catalog: {
      ...aiResearchCatalogFixture,
      models: [
        ...aiResearchCatalogFixture.models,
        {
          ...aiResearchCatalogFixture.models[0],
          id: "gpt-5.6-luna",
          label: "GPT-5.6 Luna",
          reasoning: true,
          minOutputTokens: 1024,
          admissionEnabled: false,
          actualCostEnabled: true,
        },
      ],
    },
  },
};
