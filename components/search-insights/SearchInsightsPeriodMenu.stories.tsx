import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "storybook/test";
import { SearchInsightsPeriodMenu } from "./SearchInsightsPeriodMenu";
import { storyContext } from "./search-insights-story-fixtures";

const meta = {
  args: { period: storyContext.period, yoy: storyContext.yoy },
  component: SearchInsightsPeriodMenu,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Search Console/Period menu",
} satisfies Meta<typeof SearchInsightsPeriodMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwentyEightDays: Story = {};

export const NinetyDays: Story = {
  args: {
    period: { days: 90, id: "90", label: "90 finalized days", sub: "vs previous 90" },
  },
};

export const MenuOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Comparison window" }));
  },
};
