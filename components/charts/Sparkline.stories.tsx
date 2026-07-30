import type { Meta, StoryObj } from "@storybook/react";
import { Sparkline } from "./Sparkline";

const meta = {
  component: Sparkline,
  title: "Charts/Sparkline",
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VolumeTrend: Story = {
  args: {
    ariaLabel: "Monthly volume trend",
    data: [180, 210, 190, 260, 300, 280, 350, 330, 410, 390, 460, 500],
  },
};
