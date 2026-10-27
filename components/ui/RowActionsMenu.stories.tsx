import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { RowActionsMenu } from "./RowActionsMenu";

const meta = { title: "UI/RowActionsMenu", component: RowActionsMenu } satisfies Meta<
  typeof RowActionsMenu
>;
export default meta;
type Story = StoryObj<typeof meta>;
function Example() {
  const [result, setResult] = useState("No action selected");
  return (
    <div className="bg-bg p-6 text-fg">
      <RowActionsMenu
        ariaLabel="Actions for saved view"
        items={[
          { label: "Rename", onSelect: () => setResult("Rename selected") },
          { label: "Duplicate", disabled: true, onSelect: () => setResult("Duplicate selected") },
          { label: "Delete", danger: true, onSelect: () => setResult("Delete selected") },
        ]}
      />
      <p>{result}</p>
    </div>
  );
}
export const Actions: Story = {
  args: { ariaLabel: "Actions", items: [] },
  render: () => <Example />,
};
