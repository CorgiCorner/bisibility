import { KeywordScheduleInlineForm } from "@/components/keywords/KeywordScheduleInlineForm";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const keyword = { ...keywordRows[1], scheduleSource: "project" as const };

const meta = {
  title: "Keywords/KeywordScheduleInlineForm",
  component: KeywordScheduleInlineForm,
  decorators: [
    (Story) => (
      <div className="min-h-[180px] bg-bg-elev p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordScheduleInlineForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Form: Story = {
  args: {
    keyword,
    updateKeywordScheduleAction: async () => undefined,
  },
};

export const CustomCron: Story = {
  args: {
    keyword: {
      ...keyword,
      schedule: {
        ...keyword.schedule,
        cron_expression: "0 6 * * *",
        frequency: "custom_cron",
        timezone: "Europe/Warsaw",
      },
    },
    updateKeywordScheduleAction: async () => undefined,
  },
};
