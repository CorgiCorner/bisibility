import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";
import { TableCardHeader } from "./TableCardHeader";

const meta = { title: "UI/TableCardHeader", component: TableCardHeader } satisfies Meta<
  typeof TableCardHeader
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithActions: Story = {
  args: {
    title: "Saved views",
    titleId: "saved-views-title",
    actions: <Button size="sm">Create view</Button>,
  },
  render: (args) => (
    <section aria-labelledby="saved-views-title" className="bg-bg text-fg">
      <TableCardHeader {...args} />
      <p className="px-4">Your saved views appear here.</p>
    </section>
  ),
};
