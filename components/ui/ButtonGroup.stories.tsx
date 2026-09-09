import { Button } from "@/components/ui/Button";
import { ButtonGroup } from "@/components/ui/ButtonGroup";
import { Divider } from "@/components/ui/Divider";
import type { Meta, StoryObj } from "@storybook/react";

const meta = { title: "UI/ButtonGroup", component: ButtonGroup } satisfies Meta<typeof ButtonGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Variants: Story = {
  render: () => (
    <div className="p-8">
      <ButtonGroup aria-label="Run check">
        <Button>Run check</Button>
        <Button aria-label="Check options">Options</Button>
      </ButtonGroup>
      <Divider />
      <ButtonGroup variant="secondary" aria-label="Schedule">
        <Button variant="secondary">Set schedule</Button>
        <Button variant="secondary" aria-label="Schedule options">
          Options
        </Button>
      </ButtonGroup>
    </div>
  ),
};
