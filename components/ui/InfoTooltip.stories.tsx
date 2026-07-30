import { FIELD_HELP } from "@/lib/settings/field-help";
import type { Meta, StoryObj } from "@storybook/react";
import { InfoTooltip } from "./InfoTooltip";

const meta = {
  title: "UI/InfoTooltip",
  component: InfoTooltip,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-fg-muted">
          Frequency
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof InfoTooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { text: FIELD_HELP.frequency },
};
