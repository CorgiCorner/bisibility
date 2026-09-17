import { CopyButton } from "@/components/ui/CopyButton";
import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/CopyButton",
  component: CopyButton,
  decorators: [
    withSharedMessages,
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CopyButton>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = ["sm", "md", "lg"] as const;

export const Default: Story = {
  args: { text: "prj_8fK2Qf9m" },
};

export const Sizes: Story = {
  args: { text: "copy_md" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {sizes.map((size) => (
        <CopyButton key={size} label={`Copy ${size}`} size={size} text={`copy_${size}`} />
      ))}
    </div>
  ),
};
