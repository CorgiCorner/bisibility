import type { Meta, StoryObj } from "@storybook/react";
import { ValueBar } from "./ValueBar";

const meta = { title: "UI/ValueBar", component: ValueBar } satisfies Meta<typeof ValueBar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = {
  args: { max: 100, tone: "positive", value: 65 },
  render: () => (
    <div className="grid w-64 gap-3 bg-bg p-4 text-fg">
      <div>
        Growth: 65
        <ValueBar max={100} tone="positive" value={65} />
      </div>
      <div>
        Loss: 30
        <ValueBar max={100} tone="negative" value={30} />
      </div>
      <div>
        Empty: 0<ValueBar max={0} tone="positive" value={0} />
      </div>
    </div>
  ),
};
