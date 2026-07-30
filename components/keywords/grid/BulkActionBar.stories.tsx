import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { Meta, StoryObj } from "@storybook/react";
import { BulkActionBar } from "./BulkActionBar";

const actionArgs = {
  budget: { capCents: 5000, spentCents: 1250 },
  bulkClearTargetAction: async () => undefined,
  bulkDeleteAction: async () => undefined,
  bulkSetFrequencyAction: async () => undefined,
  bulkSetTargetAction: async () => undefined,
  bulkTagAction: async () => undefined,
  canDeleteKeyword: true,
  canUpdateKeyword: true,
  providerRate: { overrideCents: 0.1, providerId: "dataforseo" },
};

const meta = {
  title: "Keywords/BulkActionBar",
  component: BulkActionBar,
  decorators: [
    (Story) => (
      <div className="min-h-[140px] bg-bg p-6 text-fg">
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          <Story />
        </div>
      </div>
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
