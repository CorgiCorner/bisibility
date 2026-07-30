import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Calendar } from "./Calendar";

const meta = {
  args: { onChange: () => undefined, value: "2026-07-20" },
  component: Calendar,
  decorators: [
    (Story) => (
      <div className="min-h-[360px] bg-bg p-6 text-fg">
        <div className="w-[280px] rounded-2xl border border-border-strong bg-bg-elev p-4">
          <Story />
        </div>
      </div>
    ),
  ],
  title: "UI/Calendar",
} satisfies Meta<typeof Calendar>;

export default meta;

type Story = StoryObj<typeof meta>;

function StatefulCalendar({ initial, max }: Readonly<{ initial: string; max?: string }>) {
  const [value, setValue] = useState(initial);
  return <Calendar max={max} onChange={setValue} value={value} />;
}

export const Default: Story = {
  render: () => <StatefulCalendar initial="2026-07-20" />,
};

export const WithFutureDatesDisabled: Story = {
  render: () => <StatefulCalendar initial="2026-07-20" max="2026-07-24" />,
};
