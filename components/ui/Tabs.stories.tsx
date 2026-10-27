import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Tabs } from "./Tabs";

const meta = { title: "UI/Tabs" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function Example() {
  const [value, setValue] = useState("overview");
  return (
    <div className="bg-bg p-6 text-fg">
      <Tabs
        ariaLabel="Project sections"
        onChange={setValue}
        options={[
          { label: "Overview", value: "overview" },
          { label: "Activity", value: "activity" },
        ]}
        panelId="project-panel"
        value={value}
      />
      <div id="project-panel" role="tabpanel" aria-labelledby={`project-panel-${value}-tab`}>
        {value === "overview" ? "Project overview" : "Recent activity"}
      </div>
    </div>
  );
}
export const Interactive: Story = { render: () => <Example /> };
