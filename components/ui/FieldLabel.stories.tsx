import { FIELD_HELP } from "@/lib/settings/field-help";
import type { Meta, StoryObj } from "@storybook/react";
import { FieldLabel, FormField } from "./FieldLabel";
import { Input } from "./Input";

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
    className: "text-[10px] uppercase tracking-[0.5px] text-fg-muted",
    help: FIELD_HELP.frequency,
    label: "Frequency",
  },
};

export const AlignedFields: Story = {
  args: { label: "Aligned fields" },
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <FormField label="Language" caption="Answer language">
        <Input />
      </FormField>
      <FormField label="Search" help="Search the web" caption="Search availability">
        <Input />
      </FormField>
    </div>
  ),
};
