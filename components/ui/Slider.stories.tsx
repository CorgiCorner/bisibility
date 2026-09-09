import { Slider } from "@/components/ui/Slider";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const meta = { title: "UI/Slider", component: Slider } satisfies Meta<typeof Slider>;
export default meta;
type Story = StoryObj<typeof meta>;
function RangeExample() {
  const [values, setValues] = useState<number | number[]>([10, 60]);
  return (
    <div className="m-8 w-64 text-fg">
      <p>Position range: {Array.isArray(values) ? values.join(" - ") : values}</p>
      <Slider
        value={values}
        onValueChange={setValues}
        min={1}
        max={100}
        getAriaLabel={(index) => (index ? "Maximum position" : "Minimum position")}
      />
    </div>
  );
}
export const PositionRange: Story = {
  args: { value: [10, 60], onValueChange: () => undefined },
  render: () => <RangeExample />,
};
