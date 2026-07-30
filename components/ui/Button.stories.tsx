import { Button } from "@/components/ui/Button";
import { PlusIcon as Plus, TrashIcon as Trash } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/Button",
  component: Button,
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-center gap-3 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <>
      <Button startIcon={<Plus size={15} weight="bold" />}>Add keyword</Button>
      <Button variant="secondary">Set frequency</Button>
      <Button variant="ghost">Clear</Button>
      <Button startIcon={<Trash size={15} />} variant="destructive">
        Delete
      </Button>
      <Button loading loadingLabel="Saving">
        Save
      </Button>
    </>
  ),
};

export const Sizes: Story = {
  render: () => (
    <>
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </>
  ),
};
