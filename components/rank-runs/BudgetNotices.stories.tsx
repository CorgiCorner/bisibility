import { BudgetNotices, type BudgetNoticesProps } from "@/components/rank-runs/BudgetNotices";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

const checkRunsHref = "https://example.com/runs";
const budgetSettingsHref = "https://example.com/settings/usage?budget=edit";

const defaults = {
  layout: "keyword-stack",
  notices: [{ checkRunsHref, kind: "checks-running", runId: "rcr_running" }],
} satisfies BudgetNoticesProps;

const meta = {
  title: "Dashboard/Keywords",
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

export const NoticeChecksRunning: Story = { name: "notice-checks-running" };

export const NoticeCheckFailures: Story = {
  name: "notice-check-failures",
  args: {
    layout: "keyword-flush",
    notices: [
      {
        detail: "headless cms: The provider rejected the request - monthly quota exceeded.",
        failedCount: 3,
        kind: "check-failures",
        onRetry: fn(),
        runId: "rcr_failed",
      },
    ],
  },
};

export const NoticeBudgetExhausted: Story = {
  name: "notice-budget-exhausted",
  args: {
    layout: "keyword-flush",
    notices: [
      {
        budgetSettingsHref,
        capPeriod: "2026-09",
        kind: "budget-exhausted",
      },
    ],
  },
};
