import { StatusChip, type StatusChipProps } from "@/components/ui/StatusChip";
import type { Meta, StoryObj } from "@storybook/react";

const defaults = {
  label: "Connected",
  tone: "positive",
  variant: "soft",
  size: "sm",
  shape: "pill",
  dot: true,
  pulse: false,
  icon: "",
} satisfies StatusChipProps;

const meta = {
  title: "Components/StatusChip",
  component: StatusChip,
  args: defaults,
  decorators: [
    (Story) => (
      <div className="flex min-h-20 items-center bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };
export const DotFalse: Story = { args: { dot: false }, name: "dot-false" };
export const PulseTrue: Story = { args: { pulse: true }, name: "pulse-true" };
export const ShapeSquare: Story = { args: { shape: "square" }, name: "shape-square" };
export const SizeMd: Story = { args: { size: "md" }, name: "size-md" };
export const ToneAccent: Story = { args: { tone: "accent" }, name: "tone-accent" };
export const ToneAttention: Story = {
  args: { tone: "attention" },
  name: "tone-attention",
};
export const ToneCritical: Story = { args: { tone: "critical" }, name: "tone-critical" };
export const ToneInfo: Story = { args: { tone: "info" }, name: "tone-info" };
export const ToneNeutral: Story = { args: { tone: "neutral" }, name: "tone-neutral" };
export const TonePlanned: Story = { args: { tone: "planned" }, name: "tone-planned" };
export const VariantOutline: Story = {
  args: { variant: "outline" },
  name: "variant-outline",
};
export const VariantSolid: Story = { args: { variant: "solid" }, name: "variant-solid" };
