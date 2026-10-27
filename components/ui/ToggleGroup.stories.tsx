import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "./ToggleGroup";

const meta = { title: "UI/ToggleGroup" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function Example() {
  const [value, setValue] = useState("week");
  return (
    <div className="bg-bg p-6 text-fg">
      <ToggleGroup
        type="single"
        aria-label="Time range"
        value={value}
        onValueChange={(next) => {
          if (next) setValue(next);
        }}
      >
        <ToggleGroupItem value="day">Day</ToggleGroupItem>
        <ToggleGroupItem value="week">Week</ToggleGroupItem>
        <ToggleGroupItem value="month">Month</ToggleGroupItem>
      </ToggleGroup>
      <p>Selected: {value}</p>
    </div>
  );
}
export const TimeRange: Story = { render: () => <Example /> };
