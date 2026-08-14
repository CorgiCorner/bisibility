import type { Meta, StoryObj } from "@storybook/react";
import { AddKeywordDrawer } from "./AddKeywordDrawer";

function installFetchStub() {
  const original = window.fetch;
  window.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/locations/search")) {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return original(input);
  }) as typeof window.fetch;
}

const meta = {
  title: "Keywords/AddKeywordDrawer",
  component: AddKeywordDrawer,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [
    (Story) => {
      installFetchStub();
      return <Story />;
    },
  ],
} satisfies Meta<typeof AddKeywordDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

const projectMarkets = {
  markets: [
    {
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "Spain",
      id: "pmkt_spain_spanish",
      languageCode: "es",
      languageLabel: "Spanish",
      monthlyCostCents: 1100,
      researchAvailable: true,
      status: "active" as const,
    },
    {
      canonicalKey: "ES@en",
      countryCode: "ES",
      displayName: "Spain",
      id: "pmkt_spain_english",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: 1100,
      researchAvailable: true,
      status: "active" as const,
    },
    {
      canonicalKey: "BE@ar",
      countryCode: "BE",
      displayName: "Belgium",
      id: "pmkt_belgium_arabic",
      languageCode: "ar",
      languageLabel: "Arabic",
      monthlyCostCents: 1100,
      researchAvailable: false,
      status: "paused" as const,
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 2200,
  perMarketChecks: 24,
  projectId: "prj_7Kd2Qf9m",
};

export const Open: Story = {
  args: {
    addKeywordsAction: async () => undefined,
    costContext: {
      capCents: 5000,
      costPerCheckCents: 0.1,
      cronExpression: null,
      depth: 100,
      deviceCount: 1,
      devices: ["desktop"],
      frequency: "daily",
      keywordCount: 120,
      locationCount: 1,
      projectName: "Acme",
      providerId: "dataforseo",
      rawFrequency: "daily",
      spentCents: 1250,
    },
    domain: "acme.dev",
    onClose: () => undefined,
    open: true,
    projectId: "prj_7Kd2Qf9m",
    projectMarkets,
    tagSuggestions: ["Product", "Docs", "Comparison", "Integration"],
  },
  render: (args) => (
    <div className="min-h-[560px] bg-bg text-fg">
      <AddKeywordDrawer {...args} />
    </div>
  ),
};

export const Csv: Story = {
  ...Open,
  args: {
    ...Open.args,
    initialTab: "csv",
  },
};

export const TrackingConfiguration: Story = {
  ...Open,
  args: {
    ...Open.args,
    initialKeyword: "open source rank tracker\nseo monitoring tool",
    showSchedule: true,
  },
};
