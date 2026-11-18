import { AssistantFundingSettings } from "@/components/assistant/AssistantFundingSettings";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import type { AssistantConfigView } from "@/lib/assistant/wire";
import enassistant from "@/messages/core/en/assistant.json";
import enprojectIntegrations from "@/messages/core/en/project-integrations.json";
import esassistant from "@/messages/core/es-ES/assistant.json";
import esprojectIntegrations from "@/messages/core/es-ES/project-integrations.json";
import jaassistant from "@/messages/core/ja/assistant.json";
import japrojectIntegrations from "@/messages/core/ja/project-integrations.json";
import plassistant from "@/messages/core/pl/assistant.json";
import plprojectIntegrations from "@/messages/core/pl/project-integrations.json";
import type { Meta, StoryObj } from "@storybook/react";

const config = {
  enabled: true,
  reason: null,
  project: { publicId: "prj_test", name: "Test", role: "owner", readOnly: false },
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
  funding: [],
  fundingPreference: [{ provider: "openai", mode: "byok" }],
  creditsEnabled: true,
  defaults: { modelId: "m", funding: { mode: "byok", provider: "openai" } },
  starters: [],
  limits: { maxUserTextChars: 8000, maxSteps: 6 },
} satisfies AssistantConfigView;

const meta = {
  title: "Assistant/FundingSettings",
  component: AssistantFundingSettings,
  parameters: { nextjs: { appDirectory: true } },
  decorators: [
    (Story, context) => {
      const locale = context.globals.locale as "en" | "pl" | "es-ES" | "ja";
      const messages = {
        en: { ...enassistant, ...enprojectIntegrations },
        pl: { ...plassistant, ...plprojectIntegrations },
        "es-ES": { ...esassistant, ...esprojectIntegrations },
        ja: { ...jaassistant, ...japrojectIntegrations },
      };
      return (
        <FeatureMessagesProvider
          locale={locale}
          messages={messages[locale] ?? messages.en}
          timeZone="UTC"
        >
          <Story />
        </FeatureMessagesProvider>
      );
    },
  ],
  args: { config, projectRef: "prj_test" },
} satisfies Meta<typeof AssistantFundingSettings>;

export default meta;
type Story = StoryObj<typeof meta>;
export const CreditsAndOwnKey: Story = {};
export const OwnKeyOnly: Story = {
  args: { config: { ...config, creditsEnabled: false, fundingPreference: [] } },
};

export const UnifiedProjectProviders: Story = {
  args: {
    providers: [
      ["openai", "OpenAI", "openai.com"],
      ["anthropic", "Anthropic", "anthropic.com"],
      ["openrouter", "OpenRouter", "openrouter.ai"],
      ["vercel_ai_gateway", "Vercel AI Gateway", "vercel.com"],
    ].map(([id, name, logoDomain]) => ({
      ...integrationCategories[0].providers[0],
      id,
      name,
      logoDomain,
      kind: "model" as const,
      status: "ready" as const,
      primary: false,
      enabled: true,
      credentialSource: "own" as const,
      hasStoredCredentials: false,
      meta: [],
      secondaryAction: undefined,
    })),
  },
};
