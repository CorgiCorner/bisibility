import { StatusPill } from "@/components/ui/StatusPill";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/StatusPill",
  component: StatusPill,
  decorators: [
    (Story) => (
      <div className="flex gap-2 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusPill>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = ["sm", "md", "lg"] as const;

export const Default: Story = {
  args: { status: "connected" },
  render: () => (
    <>
      <StatusPill primary status="connected" />
      <StatusPill status="ready" />
      <StatusPill status="planned" />
      <StatusPill status="optional" />
    </>
  ),
};

export const Sizes: Story = {
  args: { status: "connected" },
  render: () => (
    <>
      {sizes.map((size) => (
        <StatusPill key={size} primary size={size} status="connected" />
      ))}
    </>
  ),
};
