import { KeywordHeaderActions } from "@/components/keywords/KeywordHeaderActions";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Keywords/KeywordHeaderActions",
  component: KeywordHeaderActions,
  decorators: [
    (Story) => (
      <div className="flex min-h-[140px] items-start justify-end bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  args: {
    alertCreated: false,
    alertCreating: false,
    canCreateAlert: true,
    canUpdateKeyword: true,
    editing: false,
    effectiveDepth: 50,
    onCreateAlert: () => undefined,
    onExport: () => undefined,
    onRunCheck: () => undefined,
    onToggleEdit: () => undefined,
    runPending: false,
  },
} satisfies Meta<typeof KeywordHeaderActions>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pending: Story = {
  args: { runPending: true },
};
