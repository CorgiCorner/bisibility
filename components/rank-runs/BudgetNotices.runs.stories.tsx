import { BudgetNotices, type BudgetNoticesProps } from "@/components/rank-runs/BudgetNotices";
import type { Meta, StoryObj } from "@storybook/react";

const defaults = {
  layout: "runs",
  notices: [
    {
      budgetSettingsHref: "https://example.com/settings/usage?budget=edit",
      capPeriod: "2026-09",
      kind: "budget-exhausted",
    },
  ],
} satisfies BudgetNoticesProps;

const meta = {
  title: "Dashboard/Run notices",
  component: BudgetNotices,
  args: defaults,
  decorators: [
    (Story) => (
      <div className="min-h-32 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BudgetNotices>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };
