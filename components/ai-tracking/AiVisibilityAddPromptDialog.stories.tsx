import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { BrandNameSet } from "@/lib/ai-tracking/brand-name-match";
import { EMPTY_TRACKING_ENGINE_PRICES } from "@/lib/ai-tracking/tracking-engines";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AiVisibilityAddPromptDialog } from "./AiVisibilityAddPromptDialog";

const ownNames: BrandNameSet = {
  aliases: [],
  domain: "acme.example.com",
  excludedNames: [],
  label: "Acme",
};

const meta = {
  title: "AI Visibility/Add prompt",
  component: AiVisibilityAddPromptDialog,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...trackingMessages }}
        timeZone="UTC"
      >
        <DateDisplayProvider>
          <Story />
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    enginePrices: EMPTY_TRACKING_ENGINE_PRICES,
    existingTexts: ["Which tools help a small team?"],
    onClose: () => undefined,
    onCreate: async () => ({ created: 1, skipped: 0 }),
    onCreateTopic: async () => "ait_abcdefghijklmnopqrstuvwx",
    open: true,
    ownNames,
    enginesHref: "/app/prj_example/ai-visibility?tab=engines",
    enabledEngines: [{ engine: "chat_gpt", source: "consumer_scrape" }],
    topics: [{ id: "ait_abcdefghijklmnopqrstuvwx", name: "Tools" }],
  },
} satisfies Meta<typeof AiVisibilityAddPromptDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnePrompt: Story = {
  args: { defaultText: "What is Acme?" },
};

export const Bulk: Story = {
  args: {
    defaultMode: "bulk",
    defaultText: "A fresh customer question\nWhich tools help a small team?\n",
  },
};
