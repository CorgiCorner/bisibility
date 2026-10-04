import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { projectRankTrackerFeatureTestMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { SavedKeywordsTable } from "./SavedKeywordsTable";

const costContext: ProjectCostContext = {
  capCents: 5000,
  costPerCheckCents: 1,
  cronExpression: null,
  depth: 100,
  deviceCount: 1,
  devices: ["desktop"],
  frequency: "daily",
  keywordCount: 248,
  locationCount: 1,
  projectName: "Acme",
  providerId: "dataforseo",
  rawFrequency: "daily",
  spentCents: 1250,
  timezone: "UTC",
};

const terms = [
  ["standing desk mat", 12_100, 31, "transactional"],
  ["small standing desk", 8_100, 29, "commercial"],
  ["standing desk benefits", 6_600, 24, "informational"],
  ["best standing desk 2026", 14_800, 51, "commercial"],
  ["standing desk height calculator", 4_400, 18, "informational"],
  ["diy standing desk", 5_400, 21, "informational"],
  ["bamboo standing desk", 2_900, 26, "commercial"],
] as const;

const rows: SavedKeywordRow[] = terms.map(([text, volume, difficulty, intent], index) => ({
  countryCode: "US",
  cpc: 0.32 + index * 0.2,
  difficulty,
  intent,
  languageCode: "en",
  location: "US",
  publicId: `skw_${index}`,
  savedAt: new Date(Date.now() - (index === 6 ? 34 : index + 2) * 86_400_000).toISOString(),
  sourceSeed: index > 3 ? "home office desk" : "standing desk",
  text,
  trend: Array.from({ length: 12 }, (_, trendIndex) => ({
    month: trendIndex + 1,
    searchVolume: volume - (11 - trendIndex) * 100,
    year: 2026,
  })),
  variantCount: index === 3 ? 3 : 0,
  volume,
}));

const meta = {
  component: SavedKeywordsTable,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={projectRankTrackerFeatureTestMessages}
        timeZone="UTC"
      >
        <div className="min-h-screen bg-bg p-6 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Keywords/Saved/Table",
} satisfies Meta<typeof SavedKeywordsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  loaders: [
    () => {
      // Old saved layouts must be clamped to the new content minimum.
      localStorage.setItem(
        "bv:data-table:saved-keywords-table:v1",
        JSON.stringify({ columnSizing: { intent: 84 }, columnVisibility: {} }),
      );
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const cells = canvasElement.querySelectorAll('[role="cell"][data-column-id="intent"]');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const badge = cell.querySelector("span[title]") as HTMLElement;
      const box = cell.getBoundingClientRect();
      const ink = badge.getBoundingClientRect();
      const style = getComputedStyle(cell);
      expect(ink.right).toBeLessThanOrEqual(box.right - parseFloat(style.paddingRight));
      expect(ink.left).toBeGreaterThanOrEqual(box.left + parseFloat(style.paddingLeft));
    }
  },
  args: {
    addKeywordsAction: async () => ({ created: 0, keywords: [] }),
    canCreateKeyword: true,
    canDeleteKeyword: true,
    costContext,
    defaultDevice: "desktop",
    projectId: "prj_story",
    removeSavedKeywordsAction: async () => ({ removedCount: 0 }),
    rows,
    total: rows.length,
  },
};
