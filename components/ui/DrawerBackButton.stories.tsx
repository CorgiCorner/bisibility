import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DrawerBackButton } from "./DrawerBackButton";

const meta = { title: "UI/DrawerBackButton", component: DrawerBackButton } satisfies Meta<
  typeof DrawerBackButton
>;
export default meta;
type Story = StoryObj<typeof meta>;
function Example() {
  const [page, setPage] = useState("Details");
  return (
    <div className="flex items-center gap-2 bg-bg p-6 text-fg">
      <DrawerBackButton label="Back to list" onClick={() => setPage("List")} />
      <span>{page}</span>
    </div>
  );
}
export const Navigation: Story = {
  args: { label: "Back to list", onClick: () => undefined },
  render: () => <Example />,
};
