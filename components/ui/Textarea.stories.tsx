import { Textarea } from "@/components/ui/Textarea";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  decorators: [
    (Story) => (
      <div className="max-w-md bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    "aria-label": "Keywords",
    defaultValue: "headless cms\nself hosted seo tool\nrank tracker",
    placeholder: "One keyword per line",
  },
};

export const Invalid: Story = {
  args: {
    "aria-label": "CSV",
    invalid: true,
    placeholder: "keyword,target_url,tags",
  },
};
