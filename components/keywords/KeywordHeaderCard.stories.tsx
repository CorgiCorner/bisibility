import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const actionArgs = {
  addKeywordsAction: async () => undefined,
  canCreateKeyword: true,
  canUpdateKeyword: true,
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
      <div className="min-h-[260px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordHeaderCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { ...actionArgs, keyword: keywordRows[1] },
};
