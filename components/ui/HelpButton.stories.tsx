import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { HelpButton } from "./HelpButton";

const meta = { title: "UI/HelpButton", component: HelpButton } satisfies Meta<typeof HelpButton>;
export default meta;
type Story = StoryObj<typeof meta>;
function Example() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-bg p-6 text-fg">
      <span>Check frequency </span>
      <HelpButton
        aria-label="About check frequency"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      />
      {open && <p>Choose how often the project checks rankings.</p>}
    </div>
  );
}
export const Details: Story = { render: () => <Example /> };
