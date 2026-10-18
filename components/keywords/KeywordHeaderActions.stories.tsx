import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { KeywordHeaderActions } from "@/components/keywords/KeywordHeaderActions";
import { keywordManagementFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Keywords/KeywordHeaderActions",
  component: KeywordHeaderActions,
  parameters: { nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={keywordManagementFeatureTestMessages}
      >
        <div className="flex min-h-[140px] items-start justify-end bg-bg p-6 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    canUpdateKeyword: true,
    editing: false,
    effectiveDepth: 50,
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
