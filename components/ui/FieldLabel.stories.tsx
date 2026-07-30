import { FIELD_HELP } from "@/lib/settings/field-help";
import type { Meta, StoryObj } from "@storybook/react";
import { FieldLabel } from "./FieldLabel";

const meta = {
  title: "UI/FieldLabel",
  component: FieldLabel,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FieldLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint",
    help: FIELD_HELP.frequency,
    label: "Frequency",
  },
};
