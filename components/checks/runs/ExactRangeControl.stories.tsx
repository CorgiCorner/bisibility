import { withEvidenceMessages } from "@/.storybook/evidence-messages";
import { storyTimeZone } from "@/.storybook/story-locale";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { ExactRangeControl } from "./ExactRangeControl";

const meta = {
  title: "Checks/Evidence/CustomRange",
  component: ExactRangeControl,
  decorators: [withEvidenceMessages],
  render: (args, context) => (
    <ExactRangeControl
      key={`${context.globals.locale}:${context.globals.timeZone}`}
      {...args}
      timeZone={storyTimeZone(context.globals.timeZone)}
    />
  ),
  args: {
    now: new Date("2026-10-23T07:00:00Z"),
    value: { from: "2026-10-23T06:00:00Z", to: "2026-10-23T07:00:00Z" },
    timeZone: "Europe/Warsaw",
    onApply: fn(),
  },
} satisfies Meta<typeof ExactRangeControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CustomRange: Story = {};
export const InvalidRange: Story = { args: { error: true } };
