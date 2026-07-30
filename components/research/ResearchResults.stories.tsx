import type { KeywordResearchSuccess } from "@/lib/keyword-research/types";
import type { Meta, StoryObj } from "@storybook/react";
import { ResearchResults } from "./ResearchResults";

const meta = {
  component: ResearchResults,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Research/Results",
} satisfies Meta<typeof ResearchResults>;

export default meta;
type Story = StoryObj<typeof meta>;

// Providers report monthly searches newest-first; the UI sorts them chronologically.
const trend = [1510, 1420, 1350, 1280, 1160, 1190, 1120, 1040, 980, 870, 910, 820].map(
  (searchVolume, index) => {
    const date = new Date(Date.UTC(2026, 5 - index, 1));
    return { month: date.getUTCMonth() + 1, searchVolume, year: date.getUTCFullYear() };
  },
);

const result: KeywordResearchSuccess = {
  cached: true,
  cachedUntil: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
  connections: [
    { id: "conn_a00000000000000000000000", label: "DataForSEO", provider: "dataforseo" },
  ],
  costCents: 0,
  fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  ok: true,
  provider: "DataForSEO",
  rows: [
    ["best seo tools", 18_100, 32, 690, "commercial", "related", false],
    ["seo tool", 14_800, 46, 540, "commercial", "suggestion", false],
    ["SEO-tool", 14_800, 48, 540, "commercial", "idea", false],
    ["free seo checker", 9_900, 21, 175, "transactional", "suggestion", false],
    ["keyword research", 8_100, 57, 420, "informational", "related", true],
    ["rank tracker", 6_600, 42, 880, "commercial", "idea", false],
    ["website audit", 5_400, 64, 310, "informational", "related", false],
    ["seo reporting", 2_900, 36, null, "unknown", "idea", false],
  ].map(([keyword, searchVolume, difficulty, cpcCents, intent, source, alreadyTracked]) => ({
    alreadySaved: false,
    alreadyTracked: alreadyTracked as boolean,
    competition: 0.54,
    cpcCents: cpcCents as number | null,
    difficulty: difficulty as number,
    intent: intent as "commercial" | "informational" | "transactional" | "unknown",
    keyword: keyword as string,
    monthlyTrend: trend,
    searchVolume: searchVolume as number,
    source: source as "idea" | "related" | "suggestion",
  })),
  sources: [
    { cached: true, costCents: 0, returned: 3, source: "related", status: "ok" },
    { cached: true, costCents: 0, returned: 3, source: "suggestion", status: "ok" },
    {
      cached: false,
      costCents: 0,
      reason: "cost_limit",
      returned: 2,
      source: "idea",
      status: "skipped",
    },
  ],
};

export const CachedPartialResult: Story = {
  args: {
    costContext: {
      capCents: 5000,
      costPerCheckCents: 0.01,
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
    defaultTracking: {
      device: "desktop",
      location: {
        canonicalKey: "US",
        countryCode: "US",
        displayName: "United States",
        kind: "country",
      },
      scheduleFrequency: "project_default",
    },
    onAdd: () => undefined,
    onDeeper: () => undefined,
    projectId: "prj_story",
    requestedLimit: 100,
    result,
    seed: "seo tools",
  },
};
