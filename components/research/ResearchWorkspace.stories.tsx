import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import type { Meta, StoryObj } from "@storybook/react";
import { ResearchWorkspace } from "./ResearchWorkspace";
import type { ResearchWorkspaceProps } from "./research-workspace-model";

const meta = {
  component: ResearchWorkspace,
  decorators: [
    (Story) => (
      <SessionSpendProvider>
        <div className="min-h-screen bg-bg p-6 text-fg">
          <Story />
        </div>
      </SessionSpendProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Research/Workspace",
} satisfies Meta<typeof ResearchWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

const context: ResearchWorkspaceProps["context"] = {
  connections: [
    { id: "conn_a00000000000000000000000", label: "DataForSEO", provider: "dataforseo" },
  ],
  defaultMarket: {
    city: null,
    country: "United States",
    device: "desktop" as const,
    displayName: "United States",
    locationKey: "US",
    source: "explicit" as const,
  },
  language: { code: "en", label: "English" },
  location: {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    hl: "en",
    kind: "country" as const,
    languageLabel: "English",
    regionName: null,
  },
  project: { domain: "acme.dev", id: "prj_story", name: "Acme" },
};

export const Idle: Story = {
  args: {
    addKeywordsAction: async () => ({ created: 0, keywords: [], warning: null }),
    canDeleteSavedKeywords: true,
    checkHealth: {
      budget: { capCents: 5000, exhausted: false, spentCents: 1280 },
      failed24h: { count: 0, latest: null },
      providerConnected: true,
      providerRate: { overrideCents: null, providerId: "dataforseo" },
      runningCount: 0,
    },
    context,
    costContext: {
      capCents: 5000,
      costPerCheckCents: null,
      cronExpression: null,
      depth: 100,
      deviceCount: 1,
      devices: ["desktop"],
      frequency: "daily",
      keywordCount: 24,
      locationCount: 1,
      projectName: "Acme",
      providerId: "dataforseo",
      rawFrequency: "daily",
      spentCents: 1280,
      timezone: "America/New_York",
    },
    removeSavedKeywordsAction: async () => ({ removedCount: 0 }),
    researchAction: async () => ({
      cached: false,
      cachedUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      connections: context.connections,
      costCents: 3,
      estimate: true,
      fetchedAt: new Date().toISOString(),
      ok: true,
      provider: "DataForSEO",
      rows: [],
      sources: [],
    }),
    saveKeywordsAction: async () => ({ created: [], duplicateCount: 0, savedCount: 0 }),
  },
};

export const BudgetExhausted: Story = {
  args: {
    ...Idle.args,
    checkHealth: {
      ...Idle.args?.checkHealth,
      budget: { capCents: 5000, exhausted: true, spentCents: 5000 },
    } as never,
  },
};

export const CityMetricsScope: Story = {
  args: {
    ...Idle.args,
    context: {
      ...context,
      defaultMarket: {
        city: "Malaga",
        country: "Spain",
        device: "desktop",
        displayName: "Malaga, Andalusia, Spain",
        locationKey: "ES/ES-AN/Malaga",
        source: "explicit",
      },
      language: { code: "es", label: "Spanish" },
      location: {
        canonicalKey: "ES/ES-AN/Malaga",
        cityName: "Malaga",
        countryCode: "ES",
        displayName: "Malaga, Andalusia, Spain",
        hl: "es",
        kind: "city",
        languageLabel: "Spanish",
        regionName: null,
      },
    },
  },
};
