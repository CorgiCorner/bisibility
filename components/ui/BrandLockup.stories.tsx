import { BrandLockup } from "@/components/ui/BrandLockup";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/BrandLockup",
  component: BrandLockup,
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-end gap-8 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BrandLockup>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = ["sm", "md", "lg", "hero"] as const;

export const Default: Story = {
  render: () => <BrandLockup />,
};

export const Sizes: Story = {
  render: () => (
    <>
      {sizes.map((size) => (
        <BrandLockup key={size} size={size} />
      ))}
    </>
  ),
};

export const Stacked: Story = {
  render: () => <BrandLockup orientation="stacked" />,
};

export const Tones: Story = {
  render: () => (
    <>
      <BrandLockup size="lg" tone="fg" />
      <BrandLockup size="lg" tone="accent" />
      <span className="inline-flex bg-fg p-4">
        <BrandLockup size="lg" tone="inverse" />
      </span>
    </>
  ),
};

export const MarkOnly: Story = {
  render: () => <BrandLockup markOnly size="lg" />,
};
