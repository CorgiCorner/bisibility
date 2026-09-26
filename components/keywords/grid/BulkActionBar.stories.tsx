import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { projectRankTrackerFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { Meta, StoryObj } from "@storybook/react";
import { BulkActionBar } from "./BulkActionBar";

const actionArgs = {
  budget: { capCents: 5000, spentCents: 1250 },
  bulkClearTargetAction: async () => undefined,
  bulkDeleteAction: async () => undefined,
  bulkSetTargetAction: async () => undefined,
  bulkTagAction: async () => undefined,
  canDeleteKeyword: true,
  canUpdateKeyword: true,
  providerRate: { overrideCents: 0.1, providerId: "dataforseo" },
};

const meta = {
  title: "dashboard-keywords",
  component: BulkActionBar,
  parameters: { nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={projectRankTrackerFeatureTestMessages}
        timeZone="UTC"
      >
        {/* The bar docks at the bottom of the viewport, so the frame only provides the page. */}
        <div className="min-h-[220px] bg-bg p-6 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof BulkActionBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SelectedRows: Story = {
  args: {
    ...actionArgs,
    checksRunning: false,
    onClear: () => undefined,
    onRunChecks: () => undefined,
    projectId: "prj_7Kd2Qf9m",
    selectedRows: keywordRows.slice(0, 3),
  },
};

export const SelectionTrue: Story = {
  args: {
    ...actionArgs,
    onClear: () => undefined,
    onRunChecks: () => undefined,
    projectId: "prj_7Kd2Qf9m",
    selectedRows: keywordRows.slice(0, 3),
  },
  name: "selection-true",
};

export const ChecksRunning: Story = {
  args: {
    ...actionArgs,
    checksRunning: true,
    onClear: () => undefined,
    onRunChecks: () => undefined,
    projectId: "prj_7Kd2Qf9m",
    selectedRows: keywordRows.slice(0, 3),
  },
};

export const SingleTarget: Story = {
  args: {
    ...actionArgs,
    onClear: () => undefined,
    onRunChecks: () => undefined,
    projectId: "prj_7Kd2Qf9m",
    selectedRows: [keywordRows[0]],
  },
};

export const SingleWithoutTarget: Story = {
  args: {
    ...actionArgs,
    onClear: () => undefined,
    onRunChecks: () => undefined,
    projectId: "prj_7Kd2Qf9m",
    selectedRows: [{ ...keywordRows[0], targetUrl: null }],
  },
};

export const MixedTargets: Story = {
  args: {
    ...actionArgs,
    onClear: () => undefined,
    onRunChecks: () => undefined,
    projectId: "prj_7Kd2Qf9m",
    selectedRows: [
      { ...keywordRows[0], targetUrl: "/first" },
      { ...keywordRows[1], targetUrl: "/second" },
    ],
  },
};

export const MixedDepths: Story = {
  args: {
    ...SelectedRows.args,
    selectedRows: [
      { ...keywordRows[0], schedule: { ...keywordRows[0].schedule, serp_depth: 20 } },
      { ...keywordRows[1], schedule: { ...keywordRows[1].schedule, serp_depth: 100 } },
    ],
  },
};

export const MobileScrollingActions: Story = {
  args: SelectedRows.args,
  parameters: {
    chromatic: { viewports: [390] },
    viewport: { defaultViewport: "mobile1" },
  },
};
