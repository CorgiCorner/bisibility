import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { Meta, StoryObj } from "@storybook/react";

const costContext = {
  capCents: 5_000,
  costPerCheckCents: 2,
  cronExpression: null,
  depth: 20,
  deviceCount: 1,
  devices: ["desktop"],
  frequency: "weekly",
  keywordCount: 1,
  locationCount: 1,
  projectName: "Demo",
  providerId: "dataforseo",
  rawFrequency: "weekly",
  spentCents: 0,
} satisfies ProjectCostContext;

const actionArgs = {
  addKeywordsAction: async () => undefined,
  canCreateKeyword: true,
  canUpdateKeyword: true,
  costContext,
  createKeywordAlertAction: async () => undefined,
  projectId: "proj_demo",
  runCheckNowAction: async () => undefined,
  tagSuggestions: ["Product", "Docs", "Comparison"],
  updateKeywordAction: async () => undefined,
};

const meta = {
  title: "Keywords/KeywordHeaderCard",
  component: KeywordHeaderCard,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <div className="min-h-[260px] text-fg">
          <Story />
        </div>
      </KeywordDetailStoryThemes>
    ),
  ],
  parameters: {
    chromatic: { viewports: [390, 768, 1440] },
    nextjs: { appDirectory: true },
  },
} satisfies Meta<typeof KeywordHeaderCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { ...actionArgs, keyword: keywordRows[1] },
};
