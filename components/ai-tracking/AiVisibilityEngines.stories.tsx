import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { buildEnginesPageModel } from "@/lib/ai-tracking/engines-model";
import type { ProjectEngineChoice } from "@/lib/ai-tracking/project-engine-set";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AiVisibilityEnginesView } from "./AiVisibilityEnginesView";

const toggleable: ProjectEngineChoice[] = [
  { engine: "chat_gpt", source: "consumer_scrape" },
  { engine: "gemini", source: "consumer_scrape" },
  { engine: "chat_gpt", source: "model_api" },
];

function page(input: Partial<Parameters<typeof buildEnginesPageModel>[0]>) {
  return buildEnginesPageModel({
    canWrite: true,
    connected: true,
    enabled: [{ engine: "chat_gpt", source: "consumer_scrape" }],
    hasRankChecks: true,
    prices: { usdByEngine: { chat_gpt: 0.12, gemini: 0.08 } },
    recentByEngine: {},
    toggleable,
    ...input,
  });
}

async function onToggle() {
  return { ok: true as const };
}

const meta = {
  title: "AI Visibility/Engines",
  component: AiVisibilityEnginesView,
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
    model: page({}),
    onToggle,
    projectId: "prj_example",
    providersHref: "/app/prj_example/providers",
    rankHref: "/app/prj_example/rank-tracker?reportView=ai_overviews",
  },
} satisfies Meta<typeof AiVisibilityEnginesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  args: {
    model: page({ recentByEngine: { "consumer_scrape:chat_gpt": 6, "google_aio:google": 2 } }),
  },
};

export const NotConnected: Story = {
  args: {
    model: page({
      connected: false,
      hasRankChecks: false,
      prices: { usdByEngine: {} },
    }),
  },
};

export const Mixed: Story = {
  args: {
    model: page({
      enabled: [
        { engine: "gemini", source: "consumer_scrape" },
        { engine: "chat_gpt", source: "model_api" },
      ],
      prices: { usdByEngine: { gemini: 0.08 } },
      recentByEngine: { "consumer_scrape:gemini": 4 },
    }),
  },
};
