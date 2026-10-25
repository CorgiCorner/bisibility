import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import { NewResultsBanner } from "./NewResultsBanner";

function HeldUpdateStory() {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rows = shown
    ? ["Second result", "First result", "New result"]
    : ["First result", "Second result"];
  return (
    <div className="max-w-xl border border-border rounded-card text-fg bg-bg-elev">
      {!shown ? <NewResultsBanner onShow={() => setShown(true)} focusRef={ref} /> : null}
      <div ref={ref} tabIndex={-1} aria-label="Results">
        {rows.map((row) => (
          <div className="border-b border-border px-3 py-2" key={row}>
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}
const meta = { title: "Components/NewResultsBanner", component: HeldUpdateStory } satisfies Meta<
  typeof HeldUpdateStory
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const HeldUpdate: Story = {};
