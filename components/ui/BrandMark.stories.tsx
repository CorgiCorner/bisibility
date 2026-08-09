import { BrandMark } from "@/components/ui/BrandMark";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/BrandMark",
  component: BrandMark,
  decorators: [
    (Story) => (
      <div className="flex items-end gap-6 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BrandMark>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = [14, 18, 19, 26, 44, 70] as const;

export const Default: Story = {
  render: () => <BrandMark />,
};

export const Cuts: Story = {
  render: () => (
    <>
      {sizes.map((size) => (
        <BrandMark key={size} size={size} />
      ))}
    </>
  ),
};

export const Tones: Story = {
  render: () => (
    <>
      <BrandMark size={44} tone="fg" />
      <BrandMark size={44} tone="accent" />
      <span className="inline-flex bg-fg p-3">
        <BrandMark size={44} tone="inverse" />
      </span>
    </>
  ),
};
