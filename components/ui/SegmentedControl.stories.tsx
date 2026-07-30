import {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlSize,
} from "@/components/ui/SegmentedControl";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

type Density = "comfortable" | "compact" | "standard";

const densityOptions = [
  { hint: "Dense rows", label: "Compact", value: "compact" },
  { hint: "Balanced", label: "Standard", value: "standard" },
  { hint: "More air", label: "Comfort", value: "comfortable" },
] satisfies SegmentedControlOption<Density>[];

function SegmentedDemo({
  activeVariant = "neutral",
  size = "default",
}: {
  activeVariant?: "accent" | "neutral";
  size?: SegmentedControlSize;
}) {
  const [value, setValue] = useState<Density>("standard");

  return (
    <SegmentedControl
      activeVariant={activeVariant}
      className="max-w-md font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint"
      label="Density"
      name="density"
      onChange={setValue}
      options={densityOptions}
      size={size}
      value={value}
    />
  );
}

const meta = {
  title: "UI/SegmentedControl",
  component: SegmentedControl,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SegmentedControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Density",
    name: "density",
    onChange: () => undefined,
    options: densityOptions,
    value: "standard",
  },
  render: () => <SegmentedDemo />,
};

export const Field: Story = {
  ...Default,
  render: () => <SegmentedDemo size="field" />,
};

export const ExtraSmall: Story = {
  ...Default,
  render: () => <SegmentedDemo size="xs" />,
};

export const ToolbarNeutral: Story = {
  ...Default,
  render: () => <SegmentedDemo size="toolbar" />,
};

export const ToolbarAccent: Story = {
  ...Default,
  render: () => <SegmentedDemo activeVariant="accent" size="toolbar" />,
};
