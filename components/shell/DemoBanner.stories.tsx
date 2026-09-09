import type { Meta, StoryObj } from "@storybook/react";
import { DemoBanner } from "./DemoBanner";

const meta = {
  title: "Shell/DemoBanner",
  component: DemoBanner,
  args: { capturedAt: "2026-09-06T12:00:00.000Z" },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DemoBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Snapshot: Story = {};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export const UnknownSnapshot: Story = { args: { capturedAt: null } };
