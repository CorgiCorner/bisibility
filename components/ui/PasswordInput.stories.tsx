import { PasswordInput } from "@/components/ui/PasswordInput";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/PasswordInput",
  component: PasswordInput,
  decorators: [
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
      "rounded-[9px] border border-border-strong bg-bg-sunken px-[13px] py-[11px] font-mono text-[13px] font-medium text-fg outline-none placeholder:text-fg-faint focus-visible:border-accent",
    defaultValue: "plausible-secret-token",
    placeholder: "••••••••",
  },
};
