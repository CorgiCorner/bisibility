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

export const RetainedHistoryThemes: Story = {
  args: { ariaLabel: "Improving retained positions", data: [9, 8, 6] },
  render: ({ ariaLabel, data }) => (
    <div className="grid grid-cols-2 gap-4">
      {(["light", "dark"] as const).map((theme) => (
        <section
          key={theme}
          data-theme={theme}
          className="flex flex-col gap-4 rounded-card bg-bg-elev p-4 text-fg"
        >
          <strong>{theme}</strong>
          <Sparkline ariaLabel={ariaLabel} data={data} color="var(--green-text)" />
          <Sparkline ariaLabel="One retained position" data={[6]} />
          <Sparkline
            ariaLabel="Declining retained positions with a gap"
            data={[6, null, 8, 9]}
            color="var(--red-text)"
          />
        </section>
      ))}
    </div>
  ),
};
