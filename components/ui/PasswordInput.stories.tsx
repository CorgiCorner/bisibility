import { PasswordInput } from "@/components/ui/PasswordInput";
import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/PasswordInput",
  component: PasswordInput,
  decorators: [
    withSharedMessages,
    (Story) => (
      <div className="max-w-md bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PasswordInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    "aria-label": "API password",
    className:
      "rounded-control border border-border-control bg-transparent px-[13px] py-[11px] text-[13px] font-medium text-fg outline-none placeholder:text-fg-muted focus-visible:border-accent",
    defaultValue: "plausible-secret-token",
    placeholder: "••••••••",
  },
};
